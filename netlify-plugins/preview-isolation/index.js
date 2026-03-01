/* global module, process */
// Netlify Build Plugin: Preview Isolation
// Gives each deploy preview its own MongoDB database and Redis key namespace.

module.exports = {
  onPreBuild({ utils }) {
    const context = process.env.CONTEXT;
    const reviewId = process.env.REVIEW_ID;

    if (context !== 'deploy-preview') {
      utils.status.show({ summary: 'Not a deploy preview — using production defaults.' });
      return;
    }

    if (!reviewId) {
      utils.status.show({
        summary: 'Deploy preview detected but no REVIEW_ID found — skipping isolation.',
      });
      return;
    }

    const dbName = `bearwood-fantasy-pr-${reviewId}`;
    const keyPrefix = `pr${reviewId}:`;

    process.env.MONGODB_DB_NAME = dbName;
    process.env.REDIS_KEY_PREFIX = keyPrefix;

    utils.status.show({
      title: 'Preview Isolation',
      summary: `PR #${reviewId} — isolated environment configured.`,
      text: `MONGODB_DB_NAME=${dbName}\nREDIS_KEY_PREFIX=${keyPrefix}`,
    });
  },
};
