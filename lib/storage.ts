import { Redis } from "@upstash/redis";
import type { Proposal } from "./types";

const KEY_INDEX = "proposals:ids";
const KEY_PROPOSAL = (id: string) => `proposal:${id}`;
const KEY_VOTE = (hash: string) => `vote:${hash}`;
const KEY_AUTHOR = (hash: string) => `author:${hash}`;

function resolveRedis(): Redis | null {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = resolveRedis();

function hasKvEnv(): boolean {
  return redis !== null;
}

type Store = {
  listProposals(): Promise<Proposal[]>;
  getProposal(id: string): Promise<Proposal | null>;
  saveProposal(p: Proposal): Promise<void>;
  setAuthor(hash: string, id: string): Promise<void>;
  getAuthor(hash: string): Promise<string | null>;
  setVote(hash: string, id: string): Promise<void>;
  getVote(hash: string): Promise<string | null>;
  reset(): Promise<void>;
};

const memory = (() => {
  const proposals = new Map<string, Proposal>();
  const authors = new Map<string, string>();
  const votes = new Map<string, string>();
  const store: Store = {
    async listProposals() {
      return Array.from(proposals.values());
    },
    async getProposal(id) {
      return proposals.get(id) ?? null;
    },
    async saveProposal(p) {
      proposals.set(p.id, p);
    },
    async setAuthor(hash, id) {
      authors.set(hash, id);
    },
    async getAuthor(hash) {
      return authors.get(hash) ?? null;
    },
    async setVote(hash, id) {
      votes.set(hash, id);
    },
    async getVote(hash) {
      return votes.get(hash) ?? null;
    },
    async reset() {
      proposals.clear();
      authors.clear();
      votes.clear();
    },
  };
  return store;
})();

function buildRemote(client: Redis): Store {
  return {
    async listProposals() {
      const ids = (await client.smembers(KEY_INDEX)) as string[];
      if (!ids.length) return [];
      const items = await Promise.all(
        ids.map((id) => client.get<Proposal>(KEY_PROPOSAL(id))),
      );
      return items.filter((p): p is Proposal => Boolean(p));
    },
    async getProposal(id) {
      return (await client.get<Proposal>(KEY_PROPOSAL(id))) ?? null;
    },
    async saveProposal(p) {
      await client.set(KEY_PROPOSAL(p.id), p);
      await client.sadd(KEY_INDEX, p.id);
    },
    async setAuthor(hash, id) {
      await client.set(KEY_AUTHOR(hash), id);
    },
    async getAuthor(hash) {
      return (await client.get<string>(KEY_AUTHOR(hash))) ?? null;
    },
    async setVote(hash, id) {
      await client.set(KEY_VOTE(hash), id);
    },
    async getVote(hash) {
      return (await client.get<string>(KEY_VOTE(hash))) ?? null;
    },
    async reset() {
      const ids = (await client.smembers(KEY_INDEX)) as string[];
      if (ids.length) {
        await Promise.all(ids.map((id) => client.del(KEY_PROPOSAL(id))));
      }
      await client.del(KEY_INDEX);
      for (const pattern of ["vote:*", "author:*"]) {
        let cursor: string | number = 0;
        do {
          const [next, keys] = (await client.scan(cursor, {
            match: pattern,
            count: 500,
          })) as [string, string[]];
          if (keys.length) await Promise.all(keys.map((k) => client.del(k)));
          cursor = next;
        } while (String(cursor) !== "0");
      }
    },
  };
}

const store: Store = redis ? buildRemote(redis) : memory;

export function generateProposalId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function listProposals(): Promise<Proposal[]> {
  const all = await store.listProposals();
  return all.sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt);
}

export async function getMyProposalId(authorHash: string): Promise<string | null> {
  return store.getAuthor(authorHash);
}

export async function getMyVotedId(voterHash: string): Promise<string | null> {
  return store.getVote(voterHash);
}

export async function createProposal(input: {
  title: string;
  description: string;
  authorHash: string;
}): Promise<{ ok: true; proposal: Proposal } | { ok: false; reason: "already-proposed" }> {
  const existing = await store.getAuthor(input.authorHash);
  if (existing) {
    const cur = await store.getProposal(existing);
    if (cur) return { ok: false, reason: "already-proposed" };
  }
  const proposal: Proposal = {
    id: generateProposalId(),
    title: input.title,
    description: input.description,
    votes: 0,
    createdAt: Date.now(),
    authorHash: input.authorHash,
  };
  await store.saveProposal(proposal);
  await store.setAuthor(input.authorHash, proposal.id);
  return { ok: true, proposal };
}

export async function voteFor(
  proposalId: string,
  voterHash: string,
): Promise<
  | { ok: true; proposal: Proposal }
  | { ok: false; reason: "already-voted" | "not-found" }
> {
  const prevVote = await store.getVote(voterHash);
  if (prevVote) return { ok: false, reason: "already-voted" };
  const proposal = await store.getProposal(proposalId);
  if (!proposal) return { ok: false, reason: "not-found" };
  const updated: Proposal = { ...proposal, votes: proposal.votes + 1 };
  await store.saveProposal(updated);
  await store.setVote(voterHash, proposalId);
  return { ok: true, proposal: updated };
}

export async function resetAll(): Promise<void> {
  await store.reset();
}

export function isUsingPersistentStore(): boolean {
  return hasKvEnv();
}
