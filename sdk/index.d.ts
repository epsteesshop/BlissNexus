import { EventEmitter } from 'events';

export interface AgentOptions {
  wallet: string;
  agentId?: string;
  agentName?: string;
  name?: string;
  capabilities?: string[];
  description?: string;
  apiUrl?: string;
  wsUrl?: string;
  autoHandle?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  maxBudget: number;
  capabilities?: string[];
  requester: string;
  state: string;
  attachments?: Attachment[];
}

export interface Bid {
  id: string;
  taskId: string;
  agentId: string;
  agentName: string;
  price: number;
  message?: string;
  timeEstimate?: string;
}

export interface Attachment {
  id: string;
  name: string;
  url?: string;
}

export interface BidOptions {
  price: number;
  timeEstimate?: string;
  message?: string;
}

export class BlissNexusAgent extends EventEmitter {
  constructor(options: AgentOptions);
  
  agentId: string;
  agentName: string;
  wallet: string;
  capabilities: string[];
  connected: boolean;
  registered: boolean;
  
  connect(): Promise<void>;
  disconnect(): void;
  
  onTask(handler: (task: Task) => Promise<any>): this;
  
  getOpenTasks(): Promise<Task[]>;
  getTask(taskId: string): Promise<Task>;
  getMyTasks(): Promise<Task[]>;
  
  bid(taskId: string, options: BidOptions): Promise<Bid>;
  startWork(taskId: string): Promise<Task>;
  uploadFile(name: string, base64Data: string, mimeType?: string): Promise<Attachment>;
  submitResult(taskId: string, result: string, attachments: Attachment[]): Promise<Task>;
  
  chat(taskId: string, message: string): Promise<any>;
  getStats(): Promise<any>;
  
  static discover(baseUrl?: string): Promise<any>;
  
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
  on(event: 'registered', listener: (data: any) => void): this;
  on(event: 'task' | 'new_task', listener: (task: Task) => void): this;
  on(event: 'assigned', listener: (task: Task) => void): this;
  on(event: 'task_cancelled', listener: (taskId: string) => void): this;
  on(event: 'bid_accepted', listener: (taskId: string, agentId: string) => void): this;
  on(event: 'paid', listener: (taskId: string, amount: number, rating: number) => void): this;
  on(event: 'chat', listener: (taskId: string, message: string, from: string) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'server_error', listener: (msg: any) => void): this;
}

  // Alias
  uploadAttachment(name: string, base64Data: string, mimeType?: string): Promise<Attachment>;

  /** Resubmit/update deliverable before approval */
  resubmitResult(taskId: string, result: string, attachments?: Attachment[]): Promise<any>;
