// GET /.netlify/functions/leagues-admin-list (Admin only)
// Returns ALL leagues with member details for admin management

import { ObjectId } from 'mongodb';
import { withAdmin, apiResponse } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { LeagueDocument, LEAGUES_COLLECTION } from './_shared/models/League';
import { USERS_COLLECTION } from './_shared/models/User';

export const handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'GET') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const { db } = await connectToDatabase();
    const leagues = await db
      .collection<LeagueDocument>(LEAGUES_COLLECTION)
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Get all unique user IDs across all leagues
    const allUserIds = new Set<string>();
    for (const league of leagues) {
      league.memberIds.forEach((id) => allUserIds.add(id.toString()));
    }

    // Fetch user details
    const users = await db
      .collection(USERS_COLLECTION)
      .find({ _id: { $in: Array.from(allUserIds).map((id) => new ObjectId(id)) } })
      .project({ firstName: 1, lastName: 1, username: 1 })
      .toArray();

    const userMap = new Map(
      users.map((u) => [u._id.toString(), { firstName: u.firstName, lastName: u.lastName, username: u.username }])
    );

    const result = leagues.map((league) => ({
      id: league._id.toString(),
      name: league.name,
      description: league.description || '',
      inviteCode: league.inviteCode,
      memberCount: league.memberIds.length,
      maxMembers: league.maxMembers,
      createdAt: league.createdAt,
      admin: {
        userId: league.adminId.toString(),
        ...userMap.get(league.adminId.toString()) || { firstName: 'Unknown', lastName: '', username: 'unknown' },
      },
      members: league.memberIds.map((id) => {
        const userId = id.toString();
        const user = userMap.get(userId);
        return {
          userId,
          firstName: user?.firstName || 'Unknown',
          lastName: user?.lastName || '',
          username: user?.username || 'unknown',
          isAdmin: userId === league.adminId.toString(),
        };
      }),
    }));

    return apiResponse(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch leagues';
    return apiResponse(500, null, message);
  }
});
