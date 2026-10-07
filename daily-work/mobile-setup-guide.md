# Driver Mobile App Setup Guide

This guide will walk you through setting up an Expo (React Native) app in your PNPM Turborepo for the `apps/driver-mobile` workspace.

## Step 1: Initialize the Expo App
Run this command from the root of your project to scaffold a new Expo app in the `apps/driver-mobile` directory. We use the `--template blank-typescript` for a clean slate.

```bash
cd apps
npx create-expo-app driver-mobile --template blank-typescript
cd ..
```

## Step 2: Configure Workspace `package.json`
Once created, open `apps/driver-mobile/package.json` and make sure it matches the monorepo structure. Update the name and add the workspace dependencies.

```json
{
  "name": "@cabzone/driver-mobile",
  "version": "1.0.0",
  "main": "expo/AppEntry.js",
  "scripts": {
    "dev": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "expo": "~51.0.0",
    "expo-status-bar": "~1.12.1",
    "react": "18.2.0",
    "react-native": "0.74.5",
    "@cabzone/contracts": "workspace:*"
  },
  "devDependencies": {
    "@babel/core": "^7.20.0",
    "@types/react": "~18.2.45",
    "@cabzone/config": "workspace:*",
    "typescript": "^5.1.3"
  }
}
```
*(Note: adjust Expo/React versions to match what `create-expo-app` installs)*

## Step 3: Configure Metro for Monorepo (Crucial)
React Native's Metro bundler doesn't follow symlinks by default, which breaks PNPM workspaces. You need to configure it to watch the entire monorepo workspace.

Create or update `apps/driver-mobile/metro.config.js`:

```javascript
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the workspace root, this can be replaced with `find-yarn-workspace-root`
const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];
// 2. Let Metro know where to resolve packages, and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// 3. Force Metro to resolve (sub)dependencies only from the `nodeModulesPaths`
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

## Step 4: Configure TypeScript
Update `apps/driver-mobile/tsconfig.json` to extend the shared configuration and include the workspace typings.

```json
{
  "extends": "../../packages/config/tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "~/*": ["src/*"]
    }
  },
  "extends": "expo/tsconfig.base",
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ]
}
```
*(Since you can only have one `extends`, we'll let Expo handle the base config, or manually merge it. A safer bet is sticking to Expo's default and ensuring `baseUrl` is set).*

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "~/*": ["src/*"]
    }
  }
}
```

## Step 5: Install Dependencies
Run the PNPM install from the project root to link the workspace packages and download modules.

```bash
pnpm install
```

## Step 6: Test the Setup
Verify that everything is wired up correctly by importing a shared contract. Open `apps/driver-mobile/App.tsx` and add an import:

```tsx
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { UserRole } from '@cabzone/contracts/identity'; // Testing monorepo import

export default function App() {
  return (
    <View style={styles.container}>
      <Text>Driver App! Role: {UserRole.DRIVER}</Text>
      <StatusBar style="auto" />
    </View>
  );
}
// ... styles
```

Start the bundler to verify:
```bash
pnpm --filter @cabzone/driver-mobile dev
```

Let me know once you complete these steps or if you run into any issues, especially with Metro resolution!
