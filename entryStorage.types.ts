export type EntrySource = 'text' | 'voice' | 'demo';

export type DbEntry = {
  id: string;
  body: string;
  source: EntrySource;
  created_at: number;
  day_key: string;
  topics: string;
  tasks: string;
  summary: string;
};
