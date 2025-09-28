// Main web app entry point
function doGet(e) {
  const page = e.parameter.page || 'login';

  try {
    let htmlOutput;

    switch(page) {
      case 'studentLogin':
        htmlOutput = HtmlService.createTemplateFromFile('studentLogin').evaluate();
        break;
      case 'teacherLogin':
        htmlOutput = HtmlService.createTemplateFromFile('teacherLogin').evaluate();
        break;
      case 'studentDashboard':
        htmlOutput = HtmlService.createTemplateFromFile('studentDashboard').evaluate();
        break;
      case 'teacherDashboard':
        htmlOutput = HtmlService.createTemplateFromFile('teacherDashboard').evaluate();
        break;
      case 'grammarPractice':
        htmlOutput = HtmlService.createTemplateFromFile('grammarPractice').evaluate();
        break;
      default:
        htmlOutput = HtmlService.createTemplateFromFile('login').evaluate();
        break;
    }

    return htmlOutput
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (error) {
    Logger.log('Error in doGet: ' + error.toString());
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
  return email.toLowerCase().endsWith('@oronoschools.org');
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
    Logger.log('Error in isTeacherEmail: ' + error.toString());
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

// Authentication functions
function authenticateStudent(email) {
  try {
    // Validate domain first
    if (!isValidOronoEmail(email)) {
      return {success: false, message: 'Please use your Orono Schools email address (@oronoschools.org).'};
    }

    // Ensure this email is not a teacher
    if (isTeacherEmail(email)) {
      return {success: false, message: 'Teacher accounts cannot access the student interface. Please use the teacher login.'};
    }

    const ss = getSpreadsheet();
    const rosterSheet = ss.getSheetByName('Student Roster');
    const data = rosterSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === email) { // Column A: Student Email
        const studentInfo = {
          email: data[i][0],
          lastName: data[i][1],
          firstName: data[i][2],
          teacher: data[i][3],
          period: data[i][4]
        };

        // Store session with additional security
        PropertiesService.getUserProperties().setProperties({
          'userType': 'student',
          'userEmail': email,
          'studentInfo': JSON.stringify(studentInfo),
          'sessionTimestamp': new Date().getTime().toString()
        });

        return {success: true, studentInfo: studentInfo};
      }
    }
    return {success: false, message: 'Student email not found in roster. Please contact your teacher if you believe this is an error.'};
  } catch (error) {
    Logger.log('Error in authenticateStudent: ' + error.toString());
    return {success: false, message: 'Authentication error: ' + error.toString()};
  }
}

function authenticateTeacher(email) {
  try {
    // Validate domain first
    if (!isValidOronoEmail(email)) {
      return {success: false, message: 'Please use your Orono Schools email address (@oronoschools.org).'};
    }

    const ss = getSpreadsheet();
    const teacherSheet = ss.getSheetByName('Teacher Emails');
    const data = teacherSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === email) { // Column A: Teacher Email
        // Store session with additional security
        PropertiesService.getUserProperties().setProperties({
          'userType': 'teacher',
          'userEmail': email,
          'sessionTimestamp': new Date().getTime().toString()
        });

        return {success: true, teacherEmail: email};
      }
    }
    return {success: false, message: 'Teacher email not found. Please contact the administrator if you believe this is an error.'};
  } catch (error) {
    Logger.log('Error in authenticateTeacher: ' + error.toString());
    return {success: false, message: 'Authentication error: ' + error.toString()};
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
    Logger.log('Error in getGrammarQuestions: ' + error.toString());
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
    Logger.log('Error in getAvailableUnits: ' + error.toString());
    return {success: false, message: 'Error retrieving units: ' + error.toString()};
  }
}

function getTopicsForUnit(unit) {
  try {
    // Validate session (both students and teachers can view topics)
    const sessionCheck = validateSession();
    if (!sessionCheck.success) {
      return {success: false, message: sessionCheck.message};
    }

    const ss = getSpreadsheet();
    const questionsSheet = ss.getSheetByName('Grammar Questions');
    const data = questionsSheet.getDataRange().getValues();
    const topics = new Set();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == unit && data[i][1]) {
        topics.add(data[i][1]);
      }
    }

    return {success: true, topics: Array.from(topics)};
  } catch (error) {
    Logger.log('Error in getTopicsForUnit: ' + error.toString());
    return {success: false, message: 'Error retrieving topics: ' + error.toString()};
  }
}

// Student progress functions
function recordStudentScore(studentEmail, unit, score, total) {
  try {
    // Validate student session
    const sessionCheck = validateSession('student');
    if (!sessionCheck.success) {
      return {success: false, message: sessionCheck.message};
    }

    const ss = getSpreadsheet();
    const userInfo = sessionCheck.userInfo;

    const studentInfo = userInfo.studentInfo;
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
    Logger.log('Error in recordStudentScore: ' + error.toString());
    return {success: false, message: 'Error recording score: ' + error.toString()};
  }
}

function getStudentProgress(studentEmail) {
  try {
    const ss = getSpreadsheet();
    const userInfo = getCurrentUser();

    if (!userInfo.success) {
      return {success: false, message: 'Invalid session'};
    }

    // If teacher is requesting, use provided email; if student, use their own email
    const targetEmail = (userInfo.userType === 'teacher') ? studentEmail : userInfo.userEmail;

    const sheets = ss.getSheets();
    const progressData = [];

    // Search all proficiency sheets
    for (let sheet of sheets) {
      const name = sheet.getName();
      if (name.includes('Student Proficiency')) {
        const data = sheet.getDataRange().getValues();

        for (let i = 1; i < data.length; i++) {
          if (data[i][1] === targetEmail) { // Column B: Student email
            progressData.push({
              timestamp: data[i][0],
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

    // Sort by timestamp, most recent first
    progressData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {success: true, progress: progressData};
  } catch (error) {
    Logger.log('Error in getStudentProgress: ' + error.toString());
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
    Logger.log('Error in getTeacherStudents: ' + error.toString());
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
    Logger.log('Error in getClassStatistics: ' + error.toString());
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
    Logger.log('Error in getFilteredProgress: ' + error.toString());
    return {success: false, message: 'Error retrieving filtered progress: ' + error.toString()};
  }
}
