export interface HelpRequest {
  id: string;
  question: string;
  callerId: string;
  status: 'pending' | 'resolved' | 'unresolved';
  createdAt: string;
  resolvedAt?: string;
  supervisorResponse?: string;
}

export interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  updated_at: string;
} 