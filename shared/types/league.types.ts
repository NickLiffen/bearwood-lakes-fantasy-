// League domain types

export interface League {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  adminId: string;
  memberIds: string[];
  memberCount: number;
  maxMembers: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLeagueDTO {
  name: string;
  description?: string;
}

export interface UpdateLeagueDTO {
  name?: string;
  description?: string;
}

export interface LeagueMemberInfo {
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  isAdmin: boolean;
}
