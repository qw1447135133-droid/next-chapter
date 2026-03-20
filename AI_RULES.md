# AI Rules for Infinio - AI视频快捷生产工具

## Tech Stack Overview

• **Frontend Framework**: React with TypeScript for type-safe development and component-based architecture
• **UI Components**: shadcn/ui library with Tailwind CSS for consistent, accessible design system
• **State Management**: React hooks for local state, with Supabase integration for persistent data management
• **AI Integration**: Google Gemini APIs for content generation, with local proxy for API calls
• **Build Tool**: Vite for fast development and optimized builds
• **Database**: Supabase PostgreSQL for project persistence and user data
• **File Storage**: Supabase Storage for generated images and documents
• **Testing**: Vitest with React Testing Library for unit and integration tests
• **Deployment**: Built-in Vite server with potential for cloud deployment
• **AI Models**: Gemini 3.1 Pro/Flash for content generation, Seedream for image generation

## Library Usage Rules

### UI and Styling
• Use shadcn/ui components exclusively for all UI elements - do not create custom components when shadcn equivalents exist
• Apply Tailwind CSS for all styling - no custom CSS files or inline styles except for dynamic values
• Use Lucide React for all icons - no other icon libraries permitted
• Implement responsive design with Tailwind's responsive prefixes

### Data Management
• Use Supabase client for all database operations - no direct database connections
• Leverage React hooks for local state management - avoid Redux or other state management libraries
• Use localStorage for client-side preferences and temporary data only
• Implement proper TypeScript interfaces for all data structures

### AI and API Integration
• Use the local gemini-client for all AI API calls - never call AI APIs directly
• Implement proper error handling with the friendly-error utility
• Use the invokeFunction wrapper for all AI operations
• Apply image compression before uploading to storage

### File Operations
• Use docx library for Word document generation
• Use ExcelJS for spreadsheet operations
• Implement proper file validation and size limits for uploads
• Use file-saver for client-side file downloads

### Accessibility and UX
• Ensure all interactive elements are keyboard accessible
• Implement proper loading states and error handling
• Use toast notifications for user feedback
• Follow WCAG guidelines for accessibility

### Code Quality
• Write TypeScript with strict typing - no `any` types unless absolutely necessary
• Use React functional components with hooks - no class components
• Implement proper error boundaries for error handling
• Follow component naming conventions (PascalCase for components)