export interface LogoutResponse {
  status: number;
  message: string;
}
export interface AuthenticatedRequest extends Request {
  user?: { _id: string };
  session?: {
    destroy: (callback?: (err?: any) => void) => void;
  };
}
