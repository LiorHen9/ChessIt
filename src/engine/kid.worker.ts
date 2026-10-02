// Web Worker for KidEngine: { id, fen, level, seed } in, { id, move } or { id, error } out.
import { kidMove } from './kid';
import { seededRng } from './random';

export interface KidRequest {
  id: number;
  fen: string;
  level: number;
  seed: number;
}

export type KidResponse = { id: number; move: string } | { id: number; error: string };

self.onmessage = (e: MessageEvent<KidRequest>) => {
  const { id, fen, level, seed } = e.data;
  let reply: KidResponse;
  try {
    reply = { id, move: kidMove(fen, level, seededRng(seed)) };
  } catch (err) {
    reply = { id, error: String(err) };
  }
  self.postMessage(reply);
};
