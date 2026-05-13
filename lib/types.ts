export type Proposal = {
  id: string;
  title: string;
  description: string;
  votes: number;
  createdAt: number;
  authorHash: string;
};

export type ProposalWithVoteState = Proposal & {
  votedByMe: boolean;
  mineToEdit: boolean;
};
