# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Google Apps Script web application for English 9 grammar practice at Orono Schools. The application provides separate interfaces for students and teachers to manage grammar exercises and track progress.

## Architecture

### Main Components
- **Code.js**: Core backend server functions handling authentication, data management, and business logic
- **HTML Templates**: Frontend interfaces for different user types and functions
- **Google Sheets Integration**: Data storage via Google Sheets with multiple worksheets

### Key Data Structure
The application connects to a Google Spreadsheet with these sheets:
- **Student Roster**: Student information (email, name, teacher, period)
- **Teacher Emails**: Authorized teacher email addresses
- **Grammar Questions**: Question bank organized by unit and topic
- **Student Proficiency [Teacher Name]**: Progress tracking sheets for each teacher

### Authentication & Security
- Domain-restricted authentication (`@oronoschools.org` emails only)
- Session-based user management with 24-hour expiration
- Role-based access control (student vs teacher interfaces)
- Teacher authorization via spreadsheet lookup

## Development Commands

### Deployment
```bash
clasp push          # Upload local changes to Google Apps Script
clasp deploy        # Create new deployment version
clasp open          # Open project in Apps Script editor
```

### Project Management
```bash
clasp pull          # Download latest from Apps Script
clasp status        # Check sync status
clasp logs          # View execution logs
```

## File Structure

### Core Files
- `Code.js`: Main server-side logic
- `appsscript.json`: Apps Script project configuration
- `.clasp.json`: Local development configuration

### HTML Templates
- `login.html`: Landing page with role selection
- `studentLogin.html` / `teacherLogin.html`: Authentication forms
- `studentDashboard.html` / `teacherDashboard.html`: Main interfaces
- `grammarPractice.html`: Student exercise interface
- `styles.html`: Shared CSS styling

## Key Functions

### Setup & Configuration
- `setupSpreadsheet()`: Initial configuration to connect to data spreadsheet
- `getSpreadsheet()`: Returns configured spreadsheet instance

### Authentication
- `authenticateStudent(email)` / `authenticateTeacher(email)`: Email-based login
- `validateSession(requiredUserType)`: Session validation middleware
- `getCurrentUser()` / `logout()`: Session management

### Student Functions
- `getGrammarQuestions(unit, topic)`: Retrieve practice questions
- `recordStudentScore(email, unit, score, total)`: Save progress data
- `getStudentProgress(email)`: Retrieve student's history

### Teacher Functions
- `getTeacherStudents()`: Get students assigned to teacher
- `getClassStatistics()`: Calculate class performance metrics
- `getFilteredProgress(email, unit)`: Advanced progress queries

## Important Notes

- All data operations require valid session authentication
- Student emails must be in the roster to access student features
- Teacher emails must be in the authorized list
- Progress is automatically recorded by teacher assignment
- The application uses Google Apps Script's PropertiesService for session management