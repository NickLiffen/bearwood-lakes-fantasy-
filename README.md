# Bearwood Lakes Fantasy League

A fantasy golf league web application for Bearwood Lakes Golf Club members.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Netlify Functions (serverless)
- **Database**: MongoDB
- **Authentication**: JWT
- **Validation**: Zod
- **Testing**: Jest, React Testing Library
- **Linting/Formatting**: ESLint 9, Prettier

## Features

- 🔐 User authentication (register/login)
- 👥 View all league members
- ⛳ Pick your team (6 golfers, $50M budget)
- 📊 Weekly and all-time scoreboards
- 🔧 Admin panel for managing golfers and scores
- 🔒 Transfer window lock/unlock

## Getting Started

### Prerequisites

- Node.js 22+
- MongoDB (local or Atlas)
- Netlify CLI (optional, for local dev)

### Installation

```bash
# Clone the repository
git clone https://github.com/NickLiffen/bearwood-lakes-fantasy-.git
cd bearwood-lakes-fantasy-

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret
```

### Development

```bash
# Start frontend only (Vite)
npm run dev

# Start with Netlify Functions (recommended)
netlify dev
```

### Scripts

| Command              | Description              |
| -------------------- | ------------------------ |
| `npm run dev`        | Start Vite dev server    |
| `npm run build`      | Build for production     |
| `npm run preview`    | Preview production build |
| `npm run test`       | Run Jest tests           |
| `npm run lint`       | Run ESLint               |
| `npm run format`     | Format with Prettier     |
| `npm run type-check` | TypeScript type checking |

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── pages/              # Page components
│   ├── hooks/              # Custom React hooks
│   ├── context/            # React Context providers
│   ├── services/           # API client
│   └── utils/              # Utility functions
├── netlify/functions/      # Serverless API
│   ├── _shared/            # Shared code (models, services, middleware)
│   └── *.ts                # API endpoints
├── shared/                 # Code shared between frontend & backend
│   ├── types/              # TypeScript types
│   ├── validators/         # Zod validation schemas
│   └── constants/          # Game rules & constants
└── __tests__/              # Test files
```

## API Endpoints

| Endpoint                | Method | Auth  | Description           |
| ----------------------- | ------ | ----- | --------------------- |
| `/auth-register`        | POST   | -     | Register new user     |
| `/auth-login`           | POST   | -     | Login                 |
| `/users-list`           | GET    | ✓     | List all users        |
| `/golfers-list`         | GET    | ✓     | List all golfers      |
| `/golfers-get`          | GET    | ✓     | Get single golfer     |
| `/golfers-create`       | POST   | Admin | Create golfer         |
| `/golfers-update`       | PUT    | Admin | Update golfer         |
| `/golfers-delete`       | DELETE | Admin | Delete golfer         |
| `/golfers-stats`        | GET    | ✓     | Get golfer statistics |
| `/picks-get`            | GET    | ✓     | Get user's picks      |
| `/picks-save`           | POST   | ✓     | Save picks            |
| `/scores-list`          | GET    | ✓     | Get scores            |
| `/scores-enter`         | POST   | Admin | Enter weekly scores   |
| `/leaderboard`          | GET    | ✓     | Get leaderboard       |
| `/admin-lock-transfers` | POST   | Admin | Toggle transfer lock  |

## Environment Variables

| Variable          | Description                   |
| ----------------- | ----------------------------- |
| `MONGODB_URI`     | MongoDB connection string     |
| `MONGODB_DB_NAME` | Database name                 |
| `JWT_SECRET`      | Secret for signing JWTs       |
| `JWT_EXPIRES_IN`  | Token expiration (e.g., `7d`) |

## Deployment

This app is configured for Netlify deployment:

1. Connect your GitHub repo to Netlify
2. Set environment variables in Netlify dashboard
3. Deploy!

Build settings are in `netlify.toml`.

## License

Private - Bearwood Lakes Golf Club
