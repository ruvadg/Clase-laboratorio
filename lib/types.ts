export type Proposal = {
  id: string;
  title: string;
  description: string;
  authorName: string;
  votes: number;
  createdAt: number;
  authorHash: string;
};

export type ProposalWithVoteState = Proposal & {
  votedByMe: boolean;
  mineToEdit: boolean;
};

export type LabState =
  | { status: "open" }
  | { status: "closed"; winnerId: string | null; closedAt: number };
