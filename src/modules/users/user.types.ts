export interface PublicUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
}
