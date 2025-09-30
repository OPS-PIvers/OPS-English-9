// Main web app entry point - now serves single page application
function doGet(e) {
  try {
    // Always serve the SPA container regardless of parameters
    const htmlOutput = HtmlService.createTemplateFromFile('app').evaluate();

    return htmlOutput
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (error) {
    // Logger.log('Error in doGet: ' + error.toString());
    return HtmlService.createHtmlOutput('<h1>Error loading page</h1><p>' + error.toString() + '</p>');
  }
}

// Include HTML files
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Get spreadsheet reference
function getSpreadsheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(PROP_SPREADSHEET_ID);
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID not configured. Please run setupSpreadsheet() function first.');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

// Domain and security validation functions
function isValidOronoEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return email.toLowerCase().endsWith(VALID_EMAIL_DOMAIN);
}

function isTeacherEmail(email) {
  try {
    const ss = getSpreadsheet();
    const teacherSheet = ss.getSheetByName(SHEET_TEACHER_EMAILS);
    const data = teacherSheet.getDataRange().getValues();

    for (let i = FIRST_DATA_ROW; i < data.length; i++) {
      if (data[i][TEACHER_EMAIL_COL.EMAIL] === email) {
        return true;
      }
    }
    return false;
  } catch (error) {
    // Logger.log('Error in isTeacherEmail: ' + error.toString());
    return false;
  }
}

function validateSession(requiredUserType) {
  const userInfo = getCurrentUser();

  if (!userInfo.success) {
    return {success: false, message: 'No valid session found'};
  }

  // Check if session has expired (24 hours)
  const sessionTimestamp = PropertiesService.getUserProperties().getProperty(PROP_SESSION_TIMESTAMP);
  if (sessionTimestamp) {
    const sessionAge = new Date().getTime() - parseInt(sessionTimestamp);
    if (sessionAge > SESSION_MAX_AGE_MS) {
      logout();
      return {success: false, message: 'Session expired'};
    }
  }

  // Check if user type matches required type
  if (requiredUserType && userInfo.userType !== requiredUserType) {
    return {success: false, message: 'Access denied for this user type'};
  }

  // Validate domain
  if (!isValidOronoEmail(userInfo.userEmail)) {
    logout();
    return {success: false, message: 'Invalid domain - session terminated'};
  }

  return {success: true, userInfo: userInfo};
}

// Setup function - run this once after deployment
function setupSpreadsheet() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'Spreadsheet Setup',
    'Please enter the ID of your English 9 Web App spreadsheet:',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() === ui.Button.OK) {
    const spreadsheetId = result.getResponseText().trim();

    try {
      // Test if spreadsheet exists and is accessible
      const testSheet = SpreadsheetApp.openById(spreadsheetId);

      // Store the ID
      PropertiesService.getScriptProperties().setProperty(PROP_SPREADSHEET_ID, spreadsheetId);

      ui.alert('Success', 'Spreadsheet configured successfully!', ui.ButtonSet.OK);

      return {success: true, message: 'Spreadsheet configured'};
    } catch (error) {
      ui.alert('Error', 'Invalid spreadsheet ID or access denied: ' + error.toString(), ui.ButtonSet.OK);
      return {success: false, message: 'Invalid spreadsheet ID'};
    }
  } else {
    return {success: false, message: 'Setup cancelled'};
  }
}

// Unified authentication function
function autoAuthenticate() {
  try {
    // Get email from OAuth session
    const email = Session.getActiveUser().getEmail();

    if (!email) {
      return {success: false, message: 'Unable to get user email. Please sign in to your Google account.'};
    }

    // Validate domain first
    if (!isValidOronoEmail(email)) {
      return {success: false, message: 'Please use your Orono Schools email address (' + VALID_EMAIL_DOMAIN + ').'};
    }

    const ss = getSpreadsheet();

    // Check if user is a teacher first
    const teacherSheet = ss.getSheetByName(SHEET_TEACHER_EMAILS);
    const teacherData = teacherSheet.getDataRange().getValues();

    for (let i = FIRST_DATA_ROW; i < teacherData.length; i++) {
      if (teacherData[i][TEACHER_EMAIL_COL.EMAIL] === email) {
        // Store teacher session
        const sessionProps = {};
        sessionProps[PROP_USER_TYPE] = USER_TYPE_TEACHER;
        sessionProps[PROP_USER_EMAIL] = email;
        sessionProps[PROP_SESSION_TIMESTAMP] = new Date().getTime().toString();
        PropertiesService.getUserProperties().setProperties(sessionProps);

        return {success: true, userType: USER_TYPE_TEACHER, userEmail: email};
      }
    }

    // Check if user is a student
    const rosterSheet = ss.getSheetByName(SHEET_STUDENT_ROSTER);
    const studentData = rosterSheet.getDataRange().getValues();

    for (let i = FIRST_DATA_ROW; i < studentData.length; i++) {
      if (studentData[i][ROSTER_COL.EMAIL] === email) {
        const studentInfo = {
          email: studentData[i][ROSTER_COL.EMAIL],
          lastName: studentData[i][ROSTER_COL.LAST_NAME],
          firstName: studentData[i][ROSTER_COL.FIRST_NAME],
          teacher: studentData[i][ROSTER_COL.TEACHER],
          period: studentData[i][ROSTER_COL.PERIOD]
        };

        // Store student session
        const sessionProps = {};
        sessionProps[PROP_USER_TYPE] = USER_TYPE_STUDENT;
        sessionProps[PROP_USER_EMAIL] = email;
        sessionProps[PROP_STUDENT_INFO] = JSON.stringify(studentInfo);
        sessionProps[PROP_SESSION_TIMESTAMP] = new Date().getTime().toString();
        PropertiesService.getUserProperties().setProperties(sessionProps);

        return {success: true, userType: USER_TYPE_STUDENT, userEmail: email, studentInfo: studentInfo};
      }
    }

    // User not found in either list
    return {success: false, message: 'Your email address is not authorized to access this application. Please contact your teacher or administrator if you believe this is an error.'};

  } catch (error) {
    // Logger.log('Error in autoAuthenticate: ' + error.toString());
    return {success: false, message: 'Authentication error: ' + error.toString()};
  }
}


// Session management
function getCurrentUser() {
  const userProps = PropertiesService.getUserProperties();
  const userType = userProps.getProperty(PROP_USER_TYPE);
  const userEmail = userProps.getProperty(PROP_USER_EMAIL);

  if (!userType || !userEmail) {
    return {success: false, message: 'No active session'};
  }

  const result = {
    success: true,
    userType: userType,
    userEmail: userEmail
  };

  if (userType === USER_TYPE_STUDENT) {
    const studentInfo = userProps.getProperty(PROP_STUDENT_INFO);
    if (studentInfo) {
      result.studentInfo = JSON.parse(studentInfo);
    }
  }

  return result;
}

function logout() {
  PropertiesService.getUserProperties().deleteAll();
  return {success: true};
}

// Grammar question functions
function getGrammarQuestions(unit, topic) {
  try {
    // Validate student session
    const sessionCheck = validateSession(USER_TYPE_STUDENT);
    if (!sessionCheck.success) {
      return {success: false, message: sessionCheck.message};
    }

    const ss = getSpreadsheet();
    const questionsSheet = ss.getSheetByName(SHEET_GRAMMAR_QUESTIONS);
    const data = questionsSheet.getDataRange().getValues();
    const questions = [];

    for (let i = FIRST_DATA_ROW; i < data.length; i++) {
      const row = data[i];
      if ((!unit || row[QUESTION_COL.UNIT] == unit) && (!topic || row[QUESTION_COL.TOPIC] === topic)) {
        questions.push({
          unit: row[QUESTION_COL.UNIT],
          topic: row[QUESTION_COL.TOPIC],
          topicDescription: row[QUESTION_COL.TOPIC_DESCRIPTION],
          questionType: row[QUESTION_COL.QUESTION_TYPE],
          difficultyLevel: row[QUESTION_COL.DIFFICULTY_LEVEL],
          question: row[QUESTION_COL.QUESTION],
          answer: row[QUESTION_COL.ANSWER],
          incorrect1: row[QUESTION_COL.INCORRECT_1],
          incorrect2: row[QUESTION_COL.INCORRECT_2],
          incorrect3: row[QUESTION_COL.INCORRECT_3],
          incorrect4: row[QUESTION_COL.INCORRECT_4],
          hint: row[QUESTION_COL.HINT]
        });
      }
    }

    return {success: true, questions: questions};
  } catch (error) {
    // Logger.log('Error in getGrammarQuestions: ' + error.toString());
    return {success: false, message: 'Error retrieving questions: ' + error.toString()};
  }
}

function getAvailableUnits() {
  try {
    // Validate session (both students and teachers can view units)
    const sessionCheck = validateSession();
    if (!sessionCheck.success) {
      return {success: false, message: sessionCheck.message};
    }

    const ss = getSpreadsheet();
    const questionsSheet = ss.getSheetByName(SHEET_GRAMMAR_QUESTIONS);
    const data = questionsSheet.getDataRange().getValues();
    const units = new Set();

    for (let i = FIRST_DATA_ROW; i < data.length; i++) {
      if (data[i][QUESTION_COL.UNIT]) {
        units.add(data[i][QUESTION_COL.UNIT]);
      }
    }

    return {success: true, units: Array.from(units).sort()};
  } catch (error) {
    // Logger.log('Error in getAvailableUnits: ' + error.toString());
    return {success: false, message: 'Error retrieving units: ' + error.toString()};
  }
}

function getTopicsForUnit(unit) {
  try {
    Logger.log('=== getTopicsForUnit: START ===');
    Logger.log('getTopicsForUnit: Received unit parameter: ' + unit);
    Logger.log('getTopicsForUnit: Unit type: ' + typeof unit);

    // Validate session (both students and teachers can view topics)
    const sessionCheck = validateSession();
    if (!sessionCheck.success) {
      Logger.log('getTopicsForUnit: Session validation failed: ' + sessionCheck.message);
      return {success: false, message: sessionCheck.message};
    }
    Logger.log('getTopicsForUnit: Session validated successfully');

    const ss = getSpreadsheet();
    const questionsSheet = ss.getSheetByName(SHEET_GRAMMAR_QUESTIONS);
    const data = questionsSheet.getDataRange().getValues();
    Logger.log('getTopicsForUnit: Loaded ' + data.length + ' rows from Grammar Questions sheet');

    const topics = new Set();
    let matchCount = 0;

    for (let i = FIRST_DATA_ROW; i < data.length; i++) {
      const rowUnit = data[i][QUESTION_COL.UNIT];
      const rowTopic = data[i][QUESTION_COL.TOPIC];

      if (i <= 5) { // Log first few rows for debugging
        Logger.log('getTopicsForUnit: Row ' + i + ' - Unit: "' + rowUnit + '" (type: ' + typeof rowUnit + '), Topic: "' + rowTopic + '"');
      }

      if (data[i][QUESTION_COL.UNIT] == unit && data[i][QUESTION_COL.TOPIC]) {
        topics.add(data[i][QUESTION_COL.TOPIC]);
        matchCount++;
        if (matchCount <= 5) { // Log first few matches
          Logger.log('getTopicsForUnit: MATCH found at row ' + i + ' - Topic: "' + data[i][QUESTION_COL.TOPIC] + '"');
        }
      }
    }

    Logger.log('getTopicsForUnit: Found ' + matchCount + ' matching rows');
    Logger.log('getTopicsForUnit: Unique topics found: ' + topics.size);
    const topicsArray = Array.from(topics);
    Logger.log('getTopicsForUnit: Topics array: ' + JSON.stringify(topicsArray));
    Logger.log('=== getTopicsForUnit: END - SUCCESS ===');

    return {success: true, topics: topicsArray};
  } catch (error) {
    Logger.log('=== getTopicsForUnit: END - ERROR ===');
    Logger.log('getTopicsForUnit: Error: ' + error.toString());
    Logger.log('getTopicsForUnit: Error stack: ' + error.stack);
    return {success: false, message: 'Error retrieving topics: ' + error.toString()};
  }
}

// Student progress functions
function recordStudentScore(unit, score, total) {
  try {
    // Validate student session
    const sessionCheck = validateSession(USER_TYPE_STUDENT);
    if (!sessionCheck.success) {
      return {success: false, message: sessionCheck.message};
    }

    const ss = getSpreadsheet();
    const userInfo = sessionCheck.userInfo;

    const studentInfo = userInfo.studentInfo;
    const studentEmail = userInfo.userEmail;
    const teacherName = studentInfo.teacher;

    // Find the appropriate proficiency sheet
    let proficiencySheet = null;
    const sheets = ss.getSheets();

    for (let sheet of sheets) {
      const name = sheet.getName();
      if (name.includes(SHEET_STUDENT_PROFICIENCY_PREFIX) && name.includes(teacherName)) {
        proficiencySheet = sheet;
        break;
      }
    }

    if (!proficiencySheet) {
      return {success: false, message: 'Proficiency sheet not found for teacher: ' + teacherName};
    }

    const timestamp = new Date();
    const percentage = Math.round((score / total) * 100);
    const studentName = studentInfo.firstName + ' ' + studentInfo.lastName;

    // Add new row with score data
    const rowData = [];
    rowData[PROFICIENCY_COL.TIMESTAMP] = timestamp;
    rowData[PROFICIENCY_COL.EMAIL] = studentEmail;
    rowData[PROFICIENCY_COL.NAME] = studentName;
    rowData[PROFICIENCY_COL.UNIT] = unit;
    rowData[PROFICIENCY_COL.SCORE] = score;
    rowData[PROFICIENCY_COL.TOTAL] = total;
    rowData[PROFICIENCY_COL.PERCENTAGE] = percentage;
    proficiencySheet.appendRow(rowData);

    return {success: true, message: 'Score recorded successfully'};
  } catch (error) {
    // Logger.log('Error in recordStudentScore: ' + error.toString());
    return {success: false, message: 'Error recording score: ' + error.toString()};
  }
}

function getStudentProgress(studentEmail) {
  try {
    const ss = getSpreadsheet();
    const userInfo = getCurrentUser();

    if (!userInfo || !userInfo.success) {
      // Logger.log('getStudentProgress: Invalid user session - ' + JSON.stringify(userInfo));
      return {success: false, message: 'Invalid session'};
    }

    // If teacher is requesting, use provided email; if student, use their own email
    const targetEmail = (userInfo.userType === USER_TYPE_TEACHER) ? studentEmail : userInfo.userEmail;

    if (!targetEmail) {
      // Logger.log('getStudentProgress: No target email found - userInfo: ' + JSON.stringify(userInfo));
      return {success: false, message: 'Unable to determine target email'};
    }

    // Logger.log('getStudentProgress: Searching for progress for email: ' + targetEmail + ', userType: ' + userInfo.userType);

    const sheets = ss.getSheets();
    const progressData = [];

    if (userInfo.userType === USER_TYPE_STUDENT) {
      // For students: target the specific teacher's proficiency sheet
      const studentInfo = userInfo.studentInfo;
      if (!studentInfo || !studentInfo.teacher) {
        // Logger.log('getStudentProgress: No teacher info found for student - studentInfo: ' + JSON.stringify(studentInfo));
        return {success: false, message: 'Student teacher information not found'};
      }

      const teacherName = studentInfo.teacher;
      // Logger.log('getStudentProgress: Looking for sheet for teacher: ' + teacherName);

      // Find the specific teacher's proficiency sheet
      let targetSheet = null;
      for (let sheet of sheets) {
        const name = sheet.getName();
        // Logger.log('getStudentProgress: Checking sheet: ' + name);
        if (name.includes(SHEET_STUDENT_PROFICIENCY_PREFIX) && name.includes(teacherName)) {
          targetSheet = sheet;
          // Logger.log('getStudentProgress: Found target sheet: ' + name);
          break;
        }
      }

      if (!targetSheet) {
        // Logger.log('getStudentProgress: Proficiency sheet not found for teacher: ' + teacherName);
        return {success: false, message: 'Proficiency sheet not found for teacher: ' + teacherName};
      }

      // Search the specific teacher's sheet
      const data = targetSheet.getDataRange().getValues();
      // Logger.log('getStudentProgress: Sheet has ' + data.length + ' rows');

      for (let i = FIRST_DATA_ROW; i < data.length; i++) {
        // Logger.log('getStudentProgress: Row ' + i + ' email: "' + data[i][PROFICIENCY_COL.EMAIL] + '" vs target: "' + targetEmail + '"');
        if (data[i][PROFICIENCY_COL.EMAIL] === targetEmail) {
          // Convert timestamp to string to avoid serialization issues
          const timestampString = data[i][PROFICIENCY_COL.TIMESTAMP] instanceof Date ?
            data[i][PROFICIENCY_COL.TIMESTAMP].toISOString() :
            data[i][PROFICIENCY_COL.TIMESTAMP].toString();

          progressData.push({
            timestamp: timestampString,
            studentEmail: data[i][PROFICIENCY_COL.EMAIL],
            studentName: data[i][PROFICIENCY_COL.NAME],
            unit: data[i][PROFICIENCY_COL.UNIT],
            score: data[i][PROFICIENCY_COL.SCORE],
            total: data[i][PROFICIENCY_COL.TOTAL],
            percentage: data[i][PROFICIENCY_COL.PERCENTAGE]
          });
          // Logger.log('getStudentProgress: Added progress record: ' + JSON.stringify(progressData[progressData.length - 1]));
        }
      }
    } else {
      // For teachers: search all proficiency sheets (existing logic)
      // Logger.log('getStudentProgress: Teacher mode - searching all proficiency sheets');
      for (let sheet of sheets) {
        const name = sheet.getName();
        if (name.includes(SHEET_STUDENT_PROFICIENCY_PREFIX)) {
          // Logger.log('getStudentProgress: Searching sheet: ' + name);
          const data = sheet.getDataRange().getValues();

          for (let i = FIRST_DATA_ROW; i < data.length; i++) {
            if (data[i][PROFICIENCY_COL.EMAIL] === targetEmail) {
              // Convert timestamp to string to avoid serialization issues
              const timestampString = data[i][PROFICIENCY_COL.TIMESTAMP] instanceof Date ?
                data[i][PROFICIENCY_COL.TIMESTAMP].toISOString() :
                data[i][PROFICIENCY_COL.TIMESTAMP].toString();

              progressData.push({
                timestamp: timestampString,
                studentEmail: data[i][PROFICIENCY_COL.EMAIL],
                studentName: data[i][PROFICIENCY_COL.NAME],
                unit: data[i][PROFICIENCY_COL.UNIT],
                score: data[i][PROFICIENCY_COL.SCORE],
                total: data[i][PROFICIENCY_COL.TOTAL],
                percentage: data[i][PROFICIENCY_COL.PERCENTAGE]
              });
            }
          }
        }
      }
    }

    // Sort by timestamp, most recent first
    // Logger.log('getStudentProgress: About to sort ' + progressData.length + ' records');
    try {
      progressData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      // Logger.log('getStudentProgress: Sorting completed successfully');
    } catch (sortError) {
      // Logger.log('getStudentProgress: Sorting failed: ' + sortError.toString());
      // Continue without sorting rather than failing completely
    }

    // Logger.log('getStudentProgress: Found ' + progressData.length + ' progress records for ' + targetEmail);

    // Prepare response object
    const response = {success: true, progress: progressData};
    // Logger.log('getStudentProgress: Prepared response object with ' + progressData.length + ' records');
    // Logger.log('getStudentProgress: Response structure: ' + JSON.stringify({
    //   success: response.success,
    //   progressCount: response.progress.length,
    //   firstRecord: response.progress.length > 0 ? 'present' : 'none'
    // }));

    // Logger.log('getStudentProgress: About to return response');

    // Try to return the response and catch any serialization errors
    try {
      // Logger.log('getStudentProgress: Attempting to return response object');
      const result = response;
      // Logger.log('getStudentProgress: Response object prepared successfully');
      return result;
    } catch (returnError) {
      // Logger.log('getStudentProgress: Failed to return response: ' + returnError.toString());
      // Logger.log('getStudentProgress: Return error details: ' + JSON.stringify({
      //   error: returnError.name,
      //   message: returnError.message,
      //   responseSize: JSON.stringify(response).length
      // }));
      return {success: false, message: 'Error returning response: ' + returnError.toString()};
    }
  } catch (error) {
    // Logger.log('Error in getStudentProgress (main catch): ' + error.toString());
    // Logger.log('getStudentProgress: Main error details: ' + JSON.stringify({
    //   error: error.name,
    //   message: error.message,
    //   stack: error.stack
    // }));
    return {success: false, message: 'Error retrieving progress: ' + error.toString()};
  }
}

// Teacher-specific functions
function getTeacherStudents() {
  try {
    // Validate teacher session
    const sessionCheck = validateSession(USER_TYPE_TEACHER);
    if (!sessionCheck.success) {
      return {success: false, message: sessionCheck.message};
    }

    const ss = getSpreadsheet();
    const userInfo = sessionCheck.userInfo;

    const rosterSheet = ss.getSheetByName(SHEET_STUDENT_ROSTER);
    const data = rosterSheet.getDataRange().getValues();
    const students = [];

    // Get teacher name from email (assumes email format like firstname.lastname@domain)
    const teacherEmail = userInfo.userEmail;
    const teacherName = teacherEmail.split('@')[0].replace('.', ' ');

    for (let i = FIRST_DATA_ROW; i < data.length; i++) {
      const row = data[i];
      // Column D contains teacher name - match against current teacher
      if (row[ROSTER_COL.TEACHER] && row[ROSTER_COL.TEACHER].toLowerCase().includes(teacherName.toLowerCase())) {
        students.push({
          email: row[ROSTER_COL.EMAIL],
          lastName: row[ROSTER_COL.LAST_NAME],
          firstName: row[ROSTER_COL.FIRST_NAME],
          teacher: row[ROSTER_COL.TEACHER],
          period: row[ROSTER_COL.PERIOD]
        });
      }
    }

    return {success: true, students: students};
  } catch (error) {
    // Logger.log('Error in getTeacherStudents: ' + error.toString());
    return {success: false, message: 'Error retrieving students: ' + error.toString()};
  }
}

function getClassStatistics() {
  try {
    // Validate teacher session
    const sessionCheck = validateSession(USER_TYPE_TEACHER);
    if (!sessionCheck.success) {
      return {success: false, message: sessionCheck.message};
    }

    const ss = getSpreadsheet();

    const teacherStudents = getTeacherStudents();
    if (!teacherStudents.success) {
      return teacherStudents;
    }

    const studentEmails = teacherStudents.students.map(s => s.email);
    const sheets = ss.getSheets();
    const allSessions = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Collect all sessions for teacher's students
    for (let sheet of sheets) {
      const name = sheet.getName();
      if (name.includes(SHEET_STUDENT_PROFICIENCY_PREFIX)) {
        const data = sheet.getDataRange().getValues();

        for (let i = FIRST_DATA_ROW; i < data.length; i++) {
          const studentEmail = data[i][PROFICIENCY_COL.EMAIL];
          if (studentEmails.includes(studentEmail)) {
            allSessions.push({
              timestamp: data[i][PROFICIENCY_COL.TIMESTAMP],
              studentEmail: studentEmail,
              studentName: data[i][PROFICIENCY_COL.NAME],
              unit: data[i][PROFICIENCY_COL.UNIT],
              score: data[i][PROFICIENCY_COL.SCORE],
              total: data[i][PROFICIENCY_COL.TOTAL],
              percentage: data[i][PROFICIENCY_COL.PERCENTAGE]
            });
          }
        }
      }
    }

    // Calculate statistics
    const totalStudents = teacherStudents.students.length;
    const totalSessions = allSessions.length;
    const averageScore = totalSessions > 0 ?
      Math.round(allSessions.reduce((sum, s) => sum + s.percentage, 0) / totalSessions) : 0;

    const activeToday = allSessions.filter(session => {
      const sessionDate = new Date(session.timestamp);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === today.getTime();
    }).length;

    // Unit breakdown
    const unitStats = {};
    allSessions.forEach(session => {
      if (!unitStats[session.unit]) {
        unitStats[session.unit] = { total: 0, sessions: 0 };
      }
      unitStats[session.unit].total += session.percentage;
      unitStats[session.unit].sessions++;
    });

    const unitBreakdown = Object.keys(unitStats).map(unit => ({
      unit: unit,
      averageScore: Math.round(unitStats[unit].total / unitStats[unit].sessions),
      sessions: unitStats[unit].sessions
    })).sort((a, b) => a.unit - b.unit);

    return {
      success: true,
      stats: {
        totalStudents: totalStudents,
        totalSessions: totalSessions,
        averageScore: averageScore,
        activeToday: activeToday,
        unitBreakdown: unitBreakdown
      }
    };
  } catch (error) {
    // Logger.log('Error in getClassStatistics: ' + error.toString());
    return {success: false, message: 'Error calculating statistics: ' + error.toString()};
  }
}

function getFilteredProgress(studentEmail, unit) {
  try {
    // Validate teacher session
    const sessionCheck = validateSession(USER_TYPE_TEACHER);
    if (!sessionCheck.success) {
      return {success: false, message: sessionCheck.message};
    }

    const ss = getSpreadsheet();

    const teacherStudents = getTeacherStudents();
    if (!teacherStudents.success) {
      return teacherStudents;
    }

    const validStudentEmails = teacherStudents.students.map(s => s.email);
    const sheets = ss.getSheets();
    const progressData = [];

    // Search all proficiency sheets
    for (let sheet of sheets) {
      const name = sheet.getName();
      if (name.includes(SHEET_STUDENT_PROFICIENCY_PREFIX)) {
        const data = sheet.getDataRange().getValues();

        for (let i = FIRST_DATA_ROW; i < data.length; i++) {
          const sessionStudentEmail = data[i][PROFICIENCY_COL.EMAIL];
          const sessionUnit = data[i][PROFICIENCY_COL.UNIT];

          // Apply filters
          if (!validStudentEmails.includes(sessionStudentEmail)) continue;
          if (studentEmail && sessionStudentEmail !== studentEmail) continue;
          if (unit && sessionUnit != unit) continue;

          progressData.push({
            timestamp: data[i][PROFICIENCY_COL.TIMESTAMP],
            studentEmail: sessionStudentEmail,
            studentName: data[i][PROFICIENCY_COL.NAME],
            unit: sessionUnit,
            score: data[i][PROFICIENCY_COL.SCORE],
            total: data[i][PROFICIENCY_COL.TOTAL],
            percentage: data[i][PROFICIENCY_COL.PERCENTAGE]
          });
        }
      }
    }

    // Sort by timestamp, most recent first
    progressData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {success: true, progress: progressData};
  } catch (error) {
    // Logger.log('Error in getFilteredProgress: ' + error.toString());
    return {success: false, message: 'Error retrieving filtered progress: ' + error.toString()};
  }
}
