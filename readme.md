# Techpea SupaMRP

Techpea SupaMRP is an Angular template for a Supabase MRP.

## Prerequisites

- **Git**
- **Node.js** (v18 or higher recommended)
- **Supabase Account** (for the backend database and authentication)

## Getting Started

### 1. Supabase Setup

1. Create a new project in Supabase.
2. In the security section select "Enable Data API".
3. Un select "Automatically expose new tables".
4. Select "Enable automatic RLS".
5. Go to Project Settings -> General and copy the project id and copy it into the supabaseUrl property in web\src\environments\environment.ts.
6. Go to Project Settings -> API keys and copy the **Publishable key** into the supabaseKey property.

```js
export const environment = {
  production: false,
  supabaseUrl: 'https://<your_project_id>.supabase.co',
  supabaseKey: '<your_publishable key>',
}
```

### 2. Supabase local setup

1. Install supabase cli 
   ```bash 
   npm install -g supabase 
   ```
2. ```bash 
   supabase init
   ```
3. ```bash 
   supabase login
   ```
4. ```bash 
   supabase link --project-ref <your-project-id>
   ```
5. ```bash 
   supabase db push
   ```

### 2. Web setup

1.  Navigate to the `web/` directory:
    ```bash
    cd web
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### 3. Running the Application

1.  Navigate to the `web/` directory (if not already in it):
    ```bash
    cd web
    ```

2. Start the development server:
    ```bash
    npm start
    ```

Navigate to `http://localhost:4300/`. The application will automatically reload if you change any of the source files.

## Deployment

### Building

Run `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory.

### Static Web App

This project is configured for deployment as an Azure Static Web App (see `staticwebapp.config.json`), but can be deployed to Vercel, Netlify, or any static host that supports Angular.
