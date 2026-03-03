export interface AgentOptions {
  agentId?: string;
  capabilities?: string[];
  beaconUrl?: string;
}

export interface Message {
  type: string;
  from?: string;
  to?: string;
  content?: any;
  [key: string]: any;
}

export class BlissNexusAgent {
  constructor(options?: AgentOptions);
  connect(): Promise<BlissNexusAgent>;
  send(type: string, data?: object): void;
  on(event: string, handler: (msg: Message) => void): BlissNexusAgent;
  listAgents(): void;
  message(toAgentId: string, content: any): void;
  bidOnTask(taskId: string, price: number): void;
  disconnect(): void;
}

export class BlissNexusClient {
  constructor(beaconUrl?: string);
  health(): Promise<object>;
  agents(): Promise<object>;
  generateWallet(): Promise<{ publicKey: string; encryptedSecret: string }>;
  getBalance(pubkey: string): Promise<{ balance: number }>;
}
