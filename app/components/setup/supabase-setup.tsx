import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useState } from "react";

export function SupabaseSetup() {
  const [step, setStep] = useState(1);
  
  const isConfigured = import.meta.env.VITE_SUPABASE_URL && 
                      import.meta.env.VITE_SUPABASE_ANON_KEY &&
                      !import.meta.env.VITE_SUPABASE_URL.includes('your_supabase');

  if (isConfigured) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Supabase Configuration</CardTitle>
            <Badge>✓ Configured</Badge>
          </div>
          <CardDescription>
            Supabase is configured and ready to use
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-orange-200 bg-orange-50/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Setup Supabase</CardTitle>
          <Badge variant="outline">Setup Required</Badge>
        </div>
        <CardDescription>
          Configure Supabase as the database backend for file uploads and processing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className={`p-3 rounded-md border ${step >= 1 ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm flex items-center justify-center font-medium">1</span>
              <span className="font-medium">Create Supabase Project</span>
            </div>
            <div className="text-sm text-gray-600 ml-8">
              <p>1. Go to <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">supabase.com/dashboard</a></p>
              <p>2. Click "New project"</p>
              <p>3. Choose a name and password</p>
              <p>4. Wait for the project to be ready</p>
            </div>
          </div>

          <div className={`p-3 rounded-md border ${step >= 2 ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm flex items-center justify-center font-medium">2</span>
              <span className="font-medium">Setup Database Schema</span>
            </div>
            <div className="text-sm text-gray-600 ml-8">
              <p>1. Go to SQL Editor in your Supabase dashboard</p>
              <p>2. Copy and paste the contents of <code className="bg-gray-100 px-1 rounded">supabase-schema.sql</code></p>
              <p>3. Click "Run" to execute the schema</p>
            </div>
          </div>

          <div className={`p-3 rounded-md border ${step >= 3 ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm flex items-center justify-center font-medium">3</span>
              <span className="font-medium">Get API Keys</span>
            </div>
            <div className="text-sm text-gray-600 ml-8">
              <p>1. Go to Settings → API in your Supabase dashboard</p>
              <p>2. Copy the "Project URL"</p>
              <p>3. Copy the "anon public" key</p>
            </div>
          </div>

          <div className={`p-3 rounded-md border ${step >= 4 ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm flex items-center justify-center font-medium">4</span>
              <span className="font-medium">Update Environment Variables</span>
            </div>
            <div className="text-sm text-gray-600 ml-8">
              <p>Update your <code className="bg-gray-100 px-1 rounded">.env.local</code> file:</p>
              <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono">
                <div>VITE_SUPABASE_URL=your_project_url</div>
                <div>VITE_SUPABASE_ANON_KEY=your_anon_key</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={() => setStep(Math.min(4, step + 1))} 
            size="sm"
            disabled={step >= 4}
          >
            {step >= 4 ? 'Setup Complete' : `Mark Step ${step} Complete`}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.reload()}
          >
            Refresh to Check Config
          </Button>
        </div>

        <div className="text-xs text-gray-500">
          💡 After completing setup, refresh the page to test the configuration
        </div>
      </CardContent>
    </Card>
  );
}