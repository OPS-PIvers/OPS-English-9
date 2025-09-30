/**
 * Constants.js
 * Global constants for the English 9 Grammar Practice application
 */

// ============================================================================
// DOMAIN & AUTHENTICATION
// ============================================================================

/** Valid email domain for Orono Schools */
const VALID_EMAIL_DOMAIN = '@orono.k12.mn.us';

/** User type constants */
const USER_TYPE_TEACHER = 'teacher';
const USER_TYPE_STUDENT = 'student';

/** Session expiration time in milliseconds (24 hours) */
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;


// ============================================================================
// PROPERTY KEYS (for PropertiesService)
// ============================================================================

/** Script property key for spreadsheet ID */
const PROP_SPREADSHEET_ID = 'SPREADSHEET_ID';

/** User property keys for session management */
const PROP_SESSION_TIMESTAMP = 'sessionTimestamp';
const PROP_USER_TYPE = 'userType';
const PROP_USER_EMAIL = 'userEmail';
const PROP_STUDENT_INFO = 'studentInfo';


// ============================================================================
// SHEET NAMES
// ============================================================================

/** Sheet containing authorized teacher email addresses */
const SHEET_TEACHER_EMAILS = 'Teacher Emails';

/** Sheet containing student roster information */
const SHEET_STUDENT_ROSTER = 'Student Roster';

/** Sheet containing grammar question bank */
const SHEET_GRAMMAR_QUESTIONS = 'Grammar Questions';

/** Prefix for student proficiency tracking sheets (one per teacher) */
const SHEET_STUDENT_PROFICIENCY_PREFIX = 'Student Proficiency';


// ============================================================================
// SPREADSHEET COLUMN INDICES
// ============================================================================

/** Student Roster sheet columns (0-indexed) */
const ROSTER_COL = {
  EMAIL: 0,
  LAST_NAME: 1,
  FIRST_NAME: 2,
  TEACHER: 3,
  PERIOD: 4
};

/** Grammar Questions sheet columns (0-indexed) */
const QUESTION_COL = {
  UNIT: 0,
  TOPIC: 1,
  TOPIC_DESCRIPTION: 2,
  QUESTION_TYPE: 3,
  DIFFICULTY_LEVEL: 4,
  QUESTION: 5,
  ANSWER: 6,
  INCORRECT_1: 7,
  INCORRECT_2: 8,
  INCORRECT_3: 9,
  INCORRECT_4: 10,
  HINT: 11
};

/** Student Proficiency sheet columns (0-indexed) */
const PROFICIENCY_COL = {
  TIMESTAMP: 0,
  EMAIL: 1,
  NAME: 2,
  UNIT: 3,
  SCORE: 4,
  TOTAL: 5,
  PERCENTAGE: 6
};

/** Teacher Emails sheet columns (0-indexed) */
const TEACHER_EMAIL_COL = {
  EMAIL: 0
};


// ============================================================================
// DATA ROW OFFSETS
// ============================================================================

/** First data row (skipping header row) */
const FIRST_DATA_ROW = 1;