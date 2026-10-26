/** Suggestions d'amélioration (accès Dev, migration 42). */

export type FeedbackKind = 'bug' | 'amelioration' | 'suggestion';
export type FeedbackStatus = 'a_faire' | 'en_cours' | 'fait' | 'refuse';
export type FeedbackPriority = 'basse' | 'normale' | 'haute';

export type Feedback = {
  id: string;
  path: string;
  page_title: string | null;
  selector: string | null;
  rel_x: number | null;
  rel_y: number | null;
  page_x: number | null;
  page_y: number | null;
  viewport_w: number | null;
  kind: FeedbackKind;
  priority: FeedbackPriority;
  body: string;
  status: FeedbackStatus;
  created_by: string | null;
  author: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  replies: { id: string; body: string; author: string | null; created_by: string | null; created_at: string }[];
};

export const KIND_LABEL: Record<FeedbackKind, string> = { bug: 'Bug', amelioration: 'Amélioration', suggestion: 'Suggestion' };
export const STATUS_LABEL: Record<FeedbackStatus, string> = { a_faire: 'À faire', en_cours: 'En cours', fait: 'Fait', refuse: 'Refusé' };
export const PRIORITY_LABEL: Record<FeedbackPriority, string> = { basse: 'Basse', normale: 'Normale', haute: 'Haute' };
export const KINDS: FeedbackKind[] = ['bug', 'amelioration', 'suggestion'];
export const STATUSES: FeedbackStatus[] = ['a_faire', 'en_cours', 'fait', 'refuse'];
export const PRIORITIES: FeedbackPriority[] = ['basse', 'normale', 'haute'];
export const isOpen = (s: FeedbackStatus) => s === 'a_faire' || s === 'en_cours';
