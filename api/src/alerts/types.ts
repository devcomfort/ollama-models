export interface AlertChannel {
  send(severity: 'warning' | 'critical', title: string, body: string): Promise<void>;
}
