import { StatusBar } from 'expo-status-bar';
import * as SQLite from 'expo-sqlite';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import {
  CalendarDays,
  CheckSquare,
  Lightbulb,
  Mic,
  Plus,
  Search,
  Sparkles,
  Square,
  StopCircle,
  Tag,
  Trash2,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type EntrySource = 'text' | 'voice' | 'demo';

type Entry = {
  id: string;
  body: string;
  source: EntrySource;
  createdAt: number;
  dayKey: string;
  topics: string[];
  tasks: string[];
  summary: string;
};

type DbEntry = {
  id: string;
  body: string;
  source: EntrySource;
  created_at: number;
  day_key: string;
  topics: string;
  tasks: string;
  summary: string;
};

const db = SQLite.openDatabaseSync('fluxiary.db');

const colors = {
  ink: '#171717',
  muted: '#707070',
  faint: '#9B9B9B',
  line: '#E6E2DC',
  paper: '#FAF8F4',
  panel: '#FFFFFF',
  accent: '#0F766E',
  accentSoft: '#D7F1EC',
  amber: '#B45309',
  rose: '#B91C1C',
  blue: '#2563EB',
};

const stopWords = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'because',
  'been',
  'before',
  'between',
  'from',
  'have',
  'into',
  'just',
  'like',
  'need',
  'note',
  'notes',
  'that',
  'the',
  'then',
  'this',
  'today',
  'tomorrow',
  'want',
  'with',
]);

const demoNotes = [
  'Think about premium search: ask the note what I decided last week and show the exact source lines.',
  'Call designer tomorrow about the capture screen. Keep it quiet and fast, no folders.',
  'Meeting with Anika: launch beta in May, test voice input on Android first, pricing can start at $6 per month.',
  'Idea #monetisation weekly memory digest, task extraction, encrypted sync, and export to Markdown.',
];

function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function dayKeyFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDay(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = dayKeyFromTimestamp(Date.now());
  const yesterday = dayKeyFromTimestamp(Date.now() - 24 * 60 * 60 * 1000);

  if (dayKey === today) return 'Today';
  if (dayKey === yesterday) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseJsonList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function mapEntry(row: DbEntry): Entry {
  return {
    id: row.id,
    body: row.body,
    source: row.source,
    createdAt: row.created_at,
    dayKey: row.day_key,
    topics: parseJsonList(row.topics),
    tasks: parseJsonList(row.tasks),
    summary: row.summary,
  };
}

function normalizeTokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function uniqueTop(values: string[], limit: number) {
  return Array.from(new Set(values)).slice(0, limit);
}

function extractTopics(text: string) {
  const hashtags = Array.from(text.matchAll(/#([a-zA-Z0-9_-]{3,})/g)).map((match) =>
    match[1].toLowerCase(),
  );
  const tokens = normalizeTokens(text).filter((token) => !token.startsWith('#'));
  const counts = tokens.reduce<Record<string, number>>((acc, token) => {
    acc[token] = (acc[token] ?? 0) + 1;
    return acc;
  }, {});
  const ranked = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token);

  return uniqueTop([...hashtags, ...ranked], 5);
}

function extractTasks(text: string) {
  const taskSignals = /\b(todo|to do|need to|remember to|follow up|call|email|buy|schedule|ship|test|fix|send)\b/i;
  return text
    .split(/[\n.?!]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 5 && taskSignals.test(part))
    .slice(0, 4);
}

function summarize(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= 110) return compact;
  return `${compact.slice(0, 107).trim()}...`;
}

function buildSearchQuery(query: string) {
  const tokens = normalizeTokens(query).map((token) => token.replace(/^#/, ''));
  return tokens.length ? tokens.map((token) => `${token}*`).join(' OR ') : '';
}

function groupByDay(entries: Entry[]) {
  return entries.reduce<Record<string, Entry[]>>((acc, entry) => {
    acc[entry.dayKey] = acc[entry.dayKey] ?? [];
    acc[entry.dayKey].push(entry);
    return acc;
  }, {});
}

function getDaySummary(entries: Entry[]) {
  const topics = uniqueTop(entries.flatMap((entry) => entry.topics), 5);
  const tasks = entries.flatMap((entry) => entry.tasks);
  const words = entries.reduce((sum, entry) => sum + entry.body.split(/\s+/).filter(Boolean).length, 0);

  return {
    topics,
    tasks,
    line: `${entries.length} captures, ${words} words${topics.length ? `, ${topics.slice(0, 3).join(', ')}` : ''}`,
  };
}

async function prepareDatabase() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY NOT NULL,
      body TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      topics TEXT NOT NULL,
      tasks TEXT NOT NULL,
      summary TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      body,
      summary,
      topics,
      content='entries',
      content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, body, summary, topics)
      VALUES (new.rowid, new.body, new.summary, new.topics);
    END;
    CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, body, summary, topics)
      VALUES('delete', old.rowid, old.body, old.summary, old.topics);
    END;
  `);
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [mode, setMode] = useState<'capture' | 'search' | 'timeline' | 'insights'>('capture');
  const [recognizing, setRecognizing] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const queryRef = useRef('');

  const loadEntries = useCallback(async () => {
    const rows = await db.getAllAsync<DbEntry>(
      'SELECT * FROM entries ORDER BY created_at DESC LIMIT 500',
    );
    setEntries(rows.map(mapEntry));
  }, []);

  useEffect(() => {
    prepareDatabase()
      .then(loadEntries)
      .then(() => setReady(true))
      .catch((error) => {
        Alert.alert('Database error', error instanceof Error ? error.message : String(error));
      });
  }, [loadEntries]);

  useSpeechRecognitionEvent('start', () => {
    setRecognizing(true);
    setVoiceError('');
  });

  useSpeechRecognitionEvent('end', () => {
    setRecognizing(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript?.trim() ?? '';
    if (!transcript) return;
    setVoiceDraft(transcript);
    if (event.isFinal) {
      setDraft((current) => `${current}${current.trim() ? '\n' : ''}${transcript}`);
      setVoiceDraft('');
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setRecognizing(false);
    setVoiceError(event.message || event.error || 'Speech recognition failed.');
  });

  const addEntry = useCallback(
    async (body: string, source: EntrySource = 'text') => {
      const clean = body.trim();
      if (!clean) return;

      const createdAt = Date.now();
      const topics = extractTopics(clean);
      const tasks = extractTasks(clean);

      await db.runAsync(
        `INSERT INTO entries (id, body, source, created_at, day_key, topics, tasks, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        nowId(),
        clean,
        source,
        createdAt,
        dayKeyFromTimestamp(createdAt),
        JSON.stringify(topics),
        JSON.stringify(tasks),
        summarize(clean),
      );
      setDraft('');
      await loadEntries();
    },
    [loadEntries],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      await db.runAsync('DELETE FROM entries WHERE id = ?', id);
      await loadEntries();
    },
    [loadEntries],
  );

  const searchEntries = useCallback(
    async (nextQuery: string) => {
      setQuery(nextQuery);
      queryRef.current = nextQuery;

      const ftsQuery = buildSearchQuery(nextQuery);
      if (!ftsQuery) {
        await loadEntries();
        return;
      }

      try {
        const rows = await db.getAllAsync<DbEntry>(
          `SELECT entries.*
           FROM entries_fts
           JOIN entries ON entries_fts.rowid = entries.rowid
           WHERE entries_fts MATCH ?
           ORDER BY bm25(entries_fts), entries.created_at DESC
           LIMIT 100`,
          ftsQuery,
        );
        if (queryRef.current === nextQuery) {
          setEntries(rows.map(mapEntry));
        }
      } catch {
        const rows = await db.getAllAsync<DbEntry>(
          'SELECT * FROM entries WHERE body LIKE ? OR summary LIKE ? OR topics LIKE ? ORDER BY created_at DESC LIMIT 100',
          `%${nextQuery}%`,
          `%${nextQuery}%`,
          `%${nextQuery}%`,
        );
        if (queryRef.current === nextQuery) {
          setEntries(rows.map(mapEntry));
        }
      }
    },
    [loadEntries],
  );

  const startVoice = useCallback(async () => {
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        setVoiceError('Microphone or speech recognition permission was not granted.');
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'free_form',
        },
      });
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const stopVoice = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const addDemoData = useCallback(async () => {
    for (const note of demoNotes) {
      await addEntry(note, 'demo');
    }
  }, [addEntry]);

  const days = useMemo(() => Array.from(new Set(entries.map((entry) => entry.dayKey))), [entries]);
  const visibleEntries = useMemo(
    () => (selectedDay ? entries.filter((entry) => entry.dayKey === selectedDay) : entries),
    [entries, selectedDay],
  );
  const grouped = useMemo(() => groupByDay(visibleEntries), [visibleEntries]);
  const allTopics = useMemo(() => uniqueTop(entries.flatMap((entry) => entry.topics), 12), [entries]);
  const allTasks = useMemo(() => entries.flatMap((entry) => entry.tasks).slice(0, 8), [entries]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>Fluxiary</Text>
            <Text style={styles.subtle}>One running note, indexed locally.</Text>
          </View>
          <View style={styles.statPill}>
            <Sparkles size={15} color={colors.accent} />
            <Text style={styles.statText}>{entries.length}</Text>
          </View>
        </View>

        <View style={styles.tabs}>
          {[
            ['capture', Plus],
            ['search', Search],
            ['timeline', CalendarDays],
            ['insights', Lightbulb],
          ].map(([tab, Icon]) => (
            <Pressable
              key={tab as string}
              onPress={() => setMode(tab as typeof mode)}
              style={[styles.tab, mode === tab && styles.activeTab]}
            >
              <Icon size={18} color={mode === tab ? colors.ink : colors.muted} />
            </Pressable>
          ))}
        </View>

        {mode === 'capture' && (
          <View style={styles.composer}>
            <TextInput
              multiline
              placeholder="Dump a thought, meeting note, task, idea..."
              placeholderTextColor={colors.faint}
              value={draft}
              onChangeText={setDraft}
              style={styles.input}
              textAlignVertical="top"
            />
            {!!voiceDraft && <Text style={styles.voicePreview}>{voiceDraft}</Text>}
            {!!voiceError && <Text style={styles.errorText}>{voiceError}</Text>}
            <View style={styles.composerActions}>
              <Pressable
                onPress={recognizing ? stopVoice : startVoice}
                style={[styles.iconButton, recognizing && styles.recordingButton]}
              >
                {recognizing ? (
                  <StopCircle size={20} color={colors.rose} />
                ) : (
                  <Mic size={20} color={colors.accent} />
                )}
              </Pressable>
              <Pressable onPress={() => addEntry(draft)} style={styles.primaryButton}>
                <Plus size={18} color="#FFFFFF" />
                <Text style={styles.primaryText}>Capture</Text>
              </Pressable>
            </View>
          </View>
        )}

        {mode === 'search' && (
          <View style={styles.searchBox}>
            <Search size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={searchEntries}
              placeholder="Search exact words or context..."
              placeholderTextColor={colors.faint}
              style={styles.searchInput}
            />
            {!!query && (
              <Pressable onPress={() => searchEntries('')}>
                <X size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>
        )}

        {mode === 'timeline' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayRail}>
            <Pressable
              onPress={() => setSelectedDay(null)}
              style={[styles.dayChip, selectedDay === null && styles.activeDayChip]}
            >
              <Text style={[styles.dayChipText, selectedDay === null && styles.activeDayText]}>All</Text>
            </Pressable>
            {days.map((day) => (
              <Pressable
                key={day}
                onPress={() => setSelectedDay(day)}
                style={[styles.dayChip, selectedDay === day && styles.activeDayChip]}
              >
                <Text style={[styles.dayChipText, selectedDay === day && styles.activeDayText]}>
                  {formatDay(day)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {mode === 'insights' && (
          <View style={styles.insightPanel}>
            <View style={styles.insightHeader}>
              <Sparkles size={17} color={colors.accent} />
              <Text style={styles.panelTitle}>Local intelligence</Text>
            </View>
            <Text style={styles.insightLine}>
              {entries.length
                ? `${entries.length} captures indexed across ${days.length} day${days.length === 1 ? '' : 's'}.`
                : 'No captures yet.'}
            </Text>
            <View style={styles.chipWrap}>
              {allTopics.map((topic) => (
                <View key={topic} style={styles.topicChip}>
                  <Tag size={13} color={colors.accent} />
                  <Text style={styles.topicText}>{topic}</Text>
                </View>
              ))}
            </View>
            <View style={styles.taskList}>
              {allTasks.map((task, index) => (
                <View key={`${task}-${index}`} style={styles.taskRow}>
                  <CheckSquare size={15} color={colors.amber} />
                  <Text style={styles.taskText}>{task}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.feed} keyboardShouldPersistTaps="handled">
          {!ready && <Text style={styles.emptyText}>Preparing local note index...</Text>}

          {ready && entries.length === 0 && (
            <View style={styles.emptyState}>
              <Square size={28} color={colors.accent} />
              <Text style={styles.emptyTitle}>Start with one thought.</Text>
              <Text style={styles.emptyText}>
                Capture anything. The app will group it by date, index it, extract topics, and surface tasks.
              </Text>
              <Pressable onPress={addDemoData} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Add sample notes</Text>
              </Pressable>
            </View>
          )}

          {Object.entries(grouped).map(([day, dayEntries]) => {
            const daySummary = getDaySummary(dayEntries);
            return (
              <View key={day} style={styles.daySection}>
                <View style={styles.dayHeader}>
                  <View>
                    <Text style={styles.dayTitle}>{formatDay(day)}</Text>
                    <Text style={styles.daySummary}>{daySummary.line}</Text>
                  </View>
                </View>

                {daySummary.tasks.length > 0 && (
                  <View style={styles.dayTasks}>
                    {daySummary.tasks.slice(0, 2).map((task, index) => (
                      <View key={`${task}-${index}`} style={styles.taskRow}>
                        <CheckSquare size={14} color={colors.amber} />
                        <Text style={styles.taskText}>{task}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {dayEntries.map((entry) => (
                  <View key={entry.id} style={styles.entry}>
                    <View style={styles.entryMeta}>
                      <Text style={styles.time}>{formatTime(entry.createdAt)}</Text>
                      <Text style={styles.source}>{entry.source}</Text>
                      <Pressable onPress={() => deleteEntry(entry.id)} hitSlop={10}>
                        <Trash2 size={15} color={colors.faint} />
                      </Pressable>
                    </View>
                    <Text style={styles.entryText}>{entry.body}</Text>
                    {entry.topics.length > 0 && (
                      <View style={styles.chipWrap}>
                        {entry.topics.map((topic) => (
                          <View key={topic} style={styles.topicChip}>
                            <Text style={styles.topicText}>{topic}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  keyboard: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  brand: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '800',
  },
  subtle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  statPill: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  tabs: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 18,
    padding: 5,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    height: 40,
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: '#EFEDEA',
  },
  composer: {
    backgroundColor: colors.panel,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  input: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 26,
    minHeight: 116,
  },
  voicePreview: {
    color: colors.accent,
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: colors.rose,
    fontSize: 13,
    marginTop: 8,
  },
  composerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 11,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  recordingButton: {
    backgroundColor: '#FEE2E2',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 11,
    flexDirection: 'row',
    gap: 8,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    margin: 18,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    height: 48,
  },
  dayRail: {
    flexGrow: 0,
    marginTop: 14,
    paddingHorizontal: 18,
  },
  dayChip: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    marginRight: 8,
    paddingHorizontal: 14,
  },
  activeDayChip: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  dayChipText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  activeDayText: {
    color: '#FFFFFF',
  },
  insightPanel: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    margin: 18,
    padding: 14,
  },
  insightHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  insightLine: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  feed: {
    padding: 18,
    paddingBottom: 42,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 42,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 16,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 11,
    borderWidth: 1,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondaryText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  daySection: {
    marginBottom: 24,
  },
  dayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dayTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
  },
  daySummary: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  dayTasks: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
    marginBottom: 10,
    padding: 10,
  },
  entry: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    padding: 13,
  },
  entryMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 8,
  },
  time: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: '800',
  },
  source: {
    color: colors.blue,
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  entryText: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 23,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  topicChip: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  topicText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
  },
  taskList: {
    gap: 8,
    marginTop: 12,
  },
  taskRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  taskText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
