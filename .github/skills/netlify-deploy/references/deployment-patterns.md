# Netlify Deployment Patterns

Common deployment scenarios and best practices for the Netlify skill.

## Deployment Decision Tree

```
Is user authenticated?
├─ No → Run `netlify login`
└─ Yes → Is site linked?
    ├─ No → Is it a Git repo?
    │   ├─ Yes → Try `netlify link --git-remote-url`
    │   │   ├─ Success → Continue to deploy
    │   │   └─ Fail → Run `netlify init`
    │   └─ No → Run `netlify init`
    └─ Yes → Is this first deploy or existing site?
        ├─ First deploy/new site → `netlify deploy --prod`
        └─ Existing site → `netlify deploy` (preview)
```

## Scenario 1: First-Time Deployment (New Project)

**Context**: User has a project that has never been deployed to Netlify.

**Steps**:

1. Check authentication: `npx netlify status`
2. If not authenticated: `npx netlify login`
3. Initialize new site: `npx netlify init`
4. Install dependencies: `npm install`
5. Deploy to production: `npx netlify deploy --prod`

## Scenario 2: Linking Existing Git Repository to Existing Site

**Context**: User has a site already on Netlify and wants to link their local repo.

**Steps**:

1. Check authentication: `npx netlify status`
2. Get Git remote: `git remote show origin`
3. Link by remote: `npx netlify link --git-remote-url <URL>`
4. If found, linked. If not, run `netlify init`

## Scenario 3: Preview Deployment (Testing Changes)

**Context**: User wants to test changes before pushing to production.

**Steps**:

1. Ensure site is linked: `npx netlify status`
2. Make code changes
3. Deploy preview: `npx netlify deploy`
4. Review preview URL
5. If approved, deploy to prod: `npx netlify deploy --prod`

## Scenario 4: Framework-Specific Deployments

### Next.js

```toml
[build]
  command = "npm run build"
  publish = ".next"
```

### React (Vite)

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

### Static HTML

```bash
npx netlify deploy --dir=. --prod
```

## Scenario 5: Monorepo Deployment

Set base in netlify.toml:

```toml
[build]
  base = "packages/frontend"
  command = "npm run build"
  publish = "dist"
```

## Best Practices

1. **Always preview first** — `netlify deploy` before `netlify deploy --prod`
2. **Use netlify.toml for consistency** — ensures consistent builds across all deployments
3. **Test builds locally first** — `npm run build` before deploying
4. **Use deploy messages** — `netlify deploy --prod --message="Fix login bug"`
5. **Never commit secrets** — use Netlify UI or CLI for sensitive environment variables

## Error Recovery Patterns

### "Publish directory not found"

Run build locally: `npm run build`, check output directory name, update netlify.toml.

### "Command failed with exit code 1"

Run build locally to reproduce: `npm run build`, fix the error, deploy again.

### "Not logged in"

```bash
npx netlify logout
npx netlify login
```

### "No site linked"

```bash
npx netlify link    # or
npx netlify init
```
