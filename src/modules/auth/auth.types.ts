export interface AuthTokenPayload {
  sub: string;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

export interface AuthSession {
  token: string;
  user: {
    _id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    status: 'ACTIVE' | 'DISABLED';
  };
}
