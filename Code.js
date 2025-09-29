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
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID not configured. Please run setupSpreadsheet() function first.');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

// Domain and security validation functions
function isValidOronoEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return email.toLowerCase().endsWith('@orono.k12.mn.us');
}

function isTeacherEmail(email) {
  try {
    const ss = getSpreadsheet();
    const teacherSheet = ss.getSheetByName('Teacher Emails');
    const data = teacherSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === email) {
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
  const sessionTimestamp = PropertiesService.getUserProperties().getProperty('sessionTimestamp');
  if (sessionTimestamp) {
    const sessionAge = new Date().getTime() - parseInt(sessionTimestamp);
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (sessionAge > maxAge) {
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
      PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheetId);

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
      return {success: false, message: 'Please use your Orono Schools email address (@orono.k12.mn.us).'};
    }

    const ss = getSpreadsheet();

    // Check if user is a teacher first
    const teacherSheet = ss.getSheetByName('Teacher Emails');
    const teacherData = teacherSheet.getDataRange().getValues();

    for (let i = 1; i < teacherData.length; i++) {
      if (teacherData[i][0] === email) {
        // Store teacher session
        PropertiesService.getUserProperties().setProperties({
          'userType': 'teacher',
          'userEmail': email,
          'sessionTimestamp': new Date().getTime().toString()
        });

        return {success: true, userType: 'teacher', userEmail: email};
      }
    }

    // Check if user is a student
    const rosterSheet = ss.getSheetByName('Student Roster');
    const studentData = rosterSheet.getDataRange().getValues();

    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === email) {
        const studentInfo = {
          email: studentData[i][0],
          lastName: studentData[i][1],
          firstName: studentData[i][2],
          teacher: studentData[i][3],
          period: studentData[i][4]
        };

        // Store student session
        PropertiesService.getUserProperties().setProperties({
          'userType': 'student',
          'userEmail': email,
          'studentInfo': JSON.stringify(studentInfo),
          'sessionTimestamp': new Date().getTime().toString()
        });

        return {success: true, userType: 'student', userEmail: email, studentInfo: studentInfo};
      }
    }

    // User not found in either list
    return {success: false, message: 'Your email address is not authorized to access this application. Please contact your teacher or administrator if you believe this is an error.'};

  } catch (error) {
    // Logger.log('Error in autoAuthenticate: ' + error.toString());
    return {success: false, message: 'Authentication error: ' + error.toString()};
  }
}

// Legacy functions kept for backward compatibility (can be removed later)
function authenticateStudent() {
  const result = autoAuthenticate();
  if (result.success && result.userType === 'student') {
    return {success: true, studentInfo: result.studentInfo};
  } else if (result.success && result.userType === 'teacher') {
    return {success: false, message: 'Teacher accounts cannot access the student interface. Please use the teacher dashboard.'};
  } else {
    return result;
  }
}

function authenticateTeacher() {
  const result = autoAuthenticate();
  if (result.success && result.userType === 'teacher') {
    return {success: true, teacherEmail: result.userEmail};
  } else if (result.success && result.userType === 'student') {
    return {success: false, message: 'Student accounts cannot access the teacher interface. Please use the student dashboard.'};
  } else {
    return result;
  }
}

// Session management
function getCurrentUser() {
  const userProps = PropertiesService.getUserProperties();
  const userType = userProps.getProperty('userType');
  const userEmail = userProps.getProperty('userEmail');

  if (!userType || !userEmail) {
    return {success: false, message: 'No active session'};
  }

  const result = {
    success: true,
    userType: userType,
    userEmail: userEmail
  };

  if (userType === 'student') {
    const studentInfo = userProps.getProperty('studentInfo');
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
    const sessionCheck = validateSession('student');
    if (!sessionCheck.success) {
      return {success: false, message: sessionCheck.message};
    }

    const ss = getSpreadsheet();
    const questionsSheet = ss.getSheetByName('Grammar Questions');
    const data = questionsSheet.getDataRange().getValues();
    const questions = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if ((!unit || row[0] == unit) && (!topic || row[1] === topic)) {
        questions.push({
          unit: row[0],
          topic: row[1],
          topicDescription: row[2],
          questionType: row[3],
          difficultyLevel: row[4],
          question: row[5],
          answer: row[6],
          incorrect1: row[7],
          incorrect2: row[8],
          incorrect3: row[9],
          incorrect4: row[10],
          hint: row[11]
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
    const questionsSheet = ss.getSheetByName('Grammar Questions');
    const data = questionsSheet.getDataRange().getValues();
    const units = new Set();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        units.add(data[i][0]);
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
    const questionsSheet = ss.getSheetByName('Grammar Questions');
    const data = questionsSheet.getDataRange().getValues();
    Logger.log('getTopicsForUnit: Loaded ' + data.length + ' rows from Grammar Questions sheet');

    const topics = new Set();
    let matchCount = 0;

    for (let i = 1; i < data.length; i++) {
      const rowUnit = data[i][0];
      const rowTopic = data[i][1];

      if (i <= 5) { // Log first few rows for debugging
        Logger.log('getTopicsForUnit: Row ' + i + ' - Unit: "' + rowUnit + '" (type: ' + typeof rowUnit + '), Topic: "' + rowTopic + '"');
      }

      if (data[i][0] == unit && data[i][1]) {
        topics.add(data[i][1]);
        matchCount++;
        if (matchCount <= 5) { // Log first few matches
          Logger.log('getTopicsForUnit: MATCH found at row ' + i + ' - Topic: "' + data[i][1] + '"');
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
    const sessionCheck = validateSession('student');
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
      if (name.includes('Student Proficiency') && name.includes(teacherName)) {
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
    proficiencySheet.appendRow([
      timestamp,
      studentEmail,
      studentName,
      unit,
      score,
      total,
      percentage
    ]);

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
    const targetEmail = (userInfo.userType === 'teacher') ? studentEmail : userInfo.userEmail;

    if (!targetEmail) {
      // Logger.log('getStudentProgress: No target email found - userInfo: ' + JSON.stringify(userInfo));
      return {success: false, message: 'Unable to determine target email'};
    }

    // Logger.log('getStudentProgress: Searching for progress for email: ' + targetEmail + ', userType: ' + userInfo.userType);

    const sheets = ss.getSheets();
    const progressData = [];

    if (userInfo.userType === 'student') {
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
        if (name.includes('Student Proficiency') && name.includes(teacherName)) {
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

      for (let i = 1; i < data.length; i++) {
        // Logger.log('getStudentProgress: Row ' + i + ' email: "' + data[i][1] + '" vs target: "' + targetEmail + '"');
        if (data[i][1] === targetEmail) { // Column B: Student email
          // Convert timestamp to string to avoid serialization issues
          const timestampString = data[i][0] instanceof Date ? data[i][0].toISOString() : data[i][0].toString();

          progressData.push({
            timestamp: timestampString,
            studentEmail: data[i][1],
            studentName: data[i][2],
            unit: data[i][3],
            score: data[i][4],
            total: data[i][5],
            percentage: data[i][6]
          });
          // Logger.log('getStudentProgress: Added progress record: ' + JSON.stringify(progressData[progressData.length - 1]));
        }
      }
    } else {
      // For teachers: search all proficiency sheets (existing logic)
      // Logger.log('getStudentProgress: Teacher mode - searching all proficiency sheets');
      for (let sheet of sheets) {
        const name = sheet.getName();
        if (name.includes('Student Proficiency')) {
          // Logger.log('getStudentProgress: Searching sheet: ' + name);
          const data = sheet.getDataRange().getValues();

          for (let i = 1; i < data.length; i++) {
            if (data[i][1] === targetEmail) { // Column B: Student email
              // Convert timestamp to string to avoid serialization issues
              const timestampString = data[i][0] instanceof Date ? data[i][0].toISOString() : data[i][0].toString();

              progressData.push({
                timestamp: timestampString,
                studentEmail: data[i][1],
                studentName: data[i][2],
                unit: data[i][3],
                score: data[i][4],
                total: data[i][5],
                percentage: data[i][6]
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
    const sessionCheck = validateSession('teacher');
    if (!sessionCheck.success) {
      return {success: false, message: sessionCheck.message};
    }

    const ss = getSpreadsheet();
    const userInfo = sessionCheck.userInfo;

    const rosterSheet = ss.getSheetByName('Student Roster');
    const data = rosterSheet.getDataRange().getValues();
    const students = [];

    // Get teacher name from email (assumes email format like firstname.lastname@domain)
    const teacherEmail = userInfo.userEmail;
    const teacherName = teacherEmail.split('@')[0].replace('.', ' ');

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      // Column D contains teacher name - match against current teacher
      if (row[3] && row[3].toLowerCase().includes(teacherName.toLowerCase())) {
        students.push({
          email: row[0],
          lastName: row[1],
          firstName: row[2],
          teacher: row[3],
          period: row[4]
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
    const sessionCheck = validateSession('teacher');
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
      if (name.includes('Student Proficiency')) {
        const data = sheet.getDataRange().getValues();

        for (let i = 1; i < data.length; i++) {
          const studentEmail = data[i][1];
          if (studentEmails.includes(studentEmail)) {
            allSessions.push({
              timestamp: data[i][0],
              studentEmail: studentEmail,
              studentName: data[i][2],
              unit: data[i][3],
              score: data[i][4],
              total: data[i][5],
              percentage: data[i][6]
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
    const sessionCheck = validateSession('teacher');
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
      if (name.includes('Student Proficiency')) {
        const data = sheet.getDataRange().getValues();

        for (let i = 1; i < data.length; i++) {
          const sessionStudentEmail = data[i][1];
          const sessionUnit = data[i][3];

          // Apply filters
          if (!validStudentEmails.includes(sessionStudentEmail)) continue;
          if (studentEmail && sessionStudentEmail !== studentEmail) continue;
          if (unit && sessionUnit != unit) continue;

          progressData.push({
            timestamp: data[i][0],
            studentEmail: sessionStudentEmail,
            studentName: data[i][2],
            unit: sessionUnit,
            score: data[i][4],
            total: data[i][5],
            percentage: data[i][6]
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
