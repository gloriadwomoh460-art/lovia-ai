/* ==========================================
   LOVIA — MAIN JAVASCRIPT
   Chat, voice, student accounts, study centre,
   saved scores, dashboard and leaderboard.
========================================== */

const SUPABASE_URL =
  "https://ydcarwwvofjctkgjwotm.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_rMeZien20_3hMuHwd5M4MQ_F-KyyzpJ";

/* ==========================================
   1. MAIN CHAT
========================================== */

const chat = document.getElementById("chat");
const form = document.getElementById("chatForm");
const input = document.getElementById("message");
const sendBtn = document.getElementById("sendBtn");
const voiceBtn = document.getElementById("voiceBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBox = document.getElementById("status");

let speakReplies = false;
let busy = false;
let history = [];

try {
  history = JSON.parse(
    localStorage.getItem("lovia_messages") || "[]"
  );

  if (!Array.isArray(history)) {
    history = [];
  }
} catch (error) {
  history = [];
}

function saveHistory() {
  try {
    localStorage.setItem(
      "lovia_messages",
      JSON.stringify(history.slice(-100))
    );
  } catch (error) {
    console.warn("Lovia could not save the conversation.");
  }
}

function setStatus(message) {
  if (statusBox) {
    statusBox.textContent = message;
  }
}

function showMessage(who, text, time, save = true) {
  if (!chat) return;

  document.getElementById("welcome")?.remove();

  const row = document.createElement("div");
  row.className = "row " + who;

  const avatar = document.createElement("div");
  avatar.className = "mini";
  avatar.textContent = who === "user" ? "🙂" : "💜";

  const group = document.createElement("div");

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  const stamp = time || new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent =
    (who === "user" ? "You" : "Lovia") + " · " + stamp;

  group.append(bubble, meta);
  row.append(avatar, group);
  chat.appendChild(row);

  chat.scrollTop = chat.scrollHeight;

  if (save) {
    history.push({
      who,
      text,
      time: stamp
    });

    history = history.slice(-100);
    saveHistory();
  }

  if (who === "lovia" && speakReplies) {
    speak(text);
  }
}

/* ==========================================
   2. STUDENT SESSION HELPERS
========================================== */

function getSavedSession() {
  try {
    return JSON.parse(
      localStorage.getItem("lovia_student_session") || "null"
    );
  } catch (error) {
    return null;
  }
}

function saveStudentSession(session) {
  localStorage.setItem(
    "lovia_student_session",
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: session.user
    })
  );
}

async function refreshStudentSession() {
  let session = getSavedSession();

  if (!session || !session.refresh_token) {
    return null;
  }

  const response = await fetch(
    SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify({
        refresh_token: session.refresh_token
      })
    }
  );

  if (!response.ok) {
    return null;
  }

  const refreshed = await response.json();

  if (
    !refreshed.access_token ||
    !refreshed.refresh_token ||
    !refreshed.user
  ) {
    return null;
  }

  saveStudentSession(refreshed);

  return {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    user: refreshed.user
  };
}

async function getValidStudentSession() {
  const session = getSavedSession();

  if (!session || !session.access_token) {
    return null;
  }

  if (!session.user || !session.user.id) {
    return null;
  }

  try {
    const response = await fetch(
      SUPABASE_URL + "/auth/v1/user",
      {
        headers: {
          "apikey": SUPABASE_PUBLISHABLE_KEY,
          "Authorization": "Bearer " + session.access_token
        }
      }
    );

    if (response.ok) {
      const user = await response.json();

      session.user = user;
      saveStudentSession(session);

      return session;
    }
  } catch (error) {
    console.warn("Lovia could not check the saved session.");
  }

  try {
    return await refreshStudentSession();
  } catch (error) {
    console.warn("Lovia could not refresh the session.");
    return null;
  }
}

/* ==========================================
   3. SEND CHAT MESSAGE TO LOVIA
========================================== */

async function sendMessage() {
  if (busy || !input || !sendBtn) return;

  const message = input.value.trim();

  if (!message) return;

  if (!SUPABASE_PUBLISHABLE_KEY) {
    setStatus("Lovia's connection is not configured.");
    return;
  }

  showMessage("user", message);

  input.value = "";
  input.style.height = "auto";

  busy = true;
  sendBtn.disabled = true;
  sendBtn.textContent = "…";

  setStatus("Lovia is thinking 💜");

  try {
    const session = await getValidStudentSession();

    if (!session || !session.access_token) {
      throw new Error(
        "Please log in to your Lovia student account first. 💜"
      );
    }

    const messages = history
      .slice(-21)
      .map(item => ({
        role: item.who === "user" ? "user" : "assistant",
        content: item.text
      }));

    const response = await fetch(
      SUPABASE_URL + "/functions/v1/hello-world",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_PUBLISHABLE_KEY,
          "Authorization": "Bearer " + session.access_token
        },
        body: JSON.stringify({
          messages: messages
        })
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        "Lovia received an unexpected server response."
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Lovia could not connect. HTTP " + response.status
      );
    }

    if (!data.reply) {
      throw new Error(
        data.error || "Lovia received no reply."
      );
    }

    showMessage("lovia", data.reply);

    setStatus("Ready to chat 💜");

  } catch (error) {
    console.error("Lovia connection error:", error);

    showMessage(
      "lovia",
      "Sorry 💜 " +
      (error.message || "I couldn't connect just now.")
    );

    setStatus("Connection problem — please try again.");

  } finally {
    busy = false;
    sendBtn.disabled = false;
    sendBtn.textContent = "Send ➤";

    input.focus();
  }
}

if (form) {
  form.addEventListener("submit", function(event) {
    event.preventDefault();
    sendMessage();
  });
}

if (input) {
  input.addEventListener("keydown", function(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form?.requestSubmit();
    }
  });

  input.addEventListener("input", function() {
    input.style.height = "auto";

    input.style.height =
      Math.min(input.scrollHeight, 110) + "px";
  });
}

/* ==========================================
   4. VOICE REPLIES
========================================== */

function speak(text) {
  if (!("speechSynthesis" in window)) {
    setStatus("Voice is not supported in this browser.");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.lang = "en";
  utterance.rate = 0.95;

  window.speechSynthesis.speak(utterance);
}

if (voiceBtn) {
  voiceBtn.addEventListener("click", function() {
    speakReplies = !speakReplies;

    voiceBtn.textContent = speakReplies ? "🔊" : "🔇";

    if (!speakReplies && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setStatus(
      speakReplies
        ? "Voice replies are on 🔊"
        : "Voice replies are off"
    );
  });
}

/* ==========================================
   5. CLEAR CONVERSATION
========================================== */

if (clearBtn) {
  clearBtn.addEventListener("click", function() {
    if (
      !confirm(
        "Do you want to clear Lovia's saved conversation?"
      )
    ) {
      return;
    }

    history = [];
    saveHistory();

    chat.innerHTML = `
      <div class="welcome" id="welcome">
        <div class="big-heart">💜</div>
        <h2>Hi, I'm Lovia!</h2>
        <p>I'm happy you're here. Ask me anything or tell me what's on your mind.</p>
      </div>
    `;

    setStatus("Conversation cleared 💜");
  });
}

/* Restore saved chat messages. */

history.forEach(function(item) {
  if (
    item &&
    (item.who === "user" || item.who === "lovia") &&
    typeof item.text === "string"
  ) {
    showMessage(item.who, item.text, item.time, false);
  }
});

setStatus("Ready to chat 💜");

/* ==========================================
   6. STUDY CENTRE NAVIGATION
========================================== */

const studyBtn = document.getElementById("studyBtn");
const studyScreen = document.getElementById("studyScreen");
const loviaApp = document.querySelector(".app");
const backToChatBtn = document.getElementById("backToChatBtn");
const startStudyBtn = document.getElementById("startStudyBtn");

if (studyBtn && studyScreen && loviaApp) {
  studyBtn.addEventListener("click", function() {
    loviaApp.style.display = "none";
    studyScreen.hidden = false;
  });
}

if (backToChatBtn && studyScreen && loviaApp) {
  backToChatBtn.addEventListener("click", function() {
    studyScreen.hidden = true;
    loviaApp.style.display = "";
  });
}

/* ==========================================
   7. AI STUDY QUESTION REQUEST
========================================== */

let studyAIQuestionNumber = 0;
let studyAILoading = false;

async function askLoviaStudyAI(prompt) {
  const session = await getValidStudentSession();

  if (!session || !session.access_token) {
    throw new Error(
      "Please log in to your student account first. 💜"
    );
  }

  const response = await fetch(
    SUPABASE_URL + "/functions/v1/hello-world",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": "Bearer " + session.access_token
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    }
  );

  const raw = await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      "Lovia received an unexpected response."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      "Lovia couldn't answer. Please try again."
    );
  }

  return data.reply || data.answer || data.message || "";
}

/* ==========================================
   8. CREATE AND DISPLAY PRACTICE QUESTIONS
========================================== */

async function loadLoviaStudyQuestion() {
  if (studyAILoading) return;

  const exam = document.getElementById("examChoice")?.value;
  const subject = document.getElementById("subjectChoice")?.value;
  const area = document.getElementById("studyQuestionArea");

  if (!area) return;

  if (!subject) {
    area.textContent = "Please choose a subject first. 💜";
    return;
  }

  studyAILoading = true;

  area.textContent = "Lovia is preparing your question... 💜";

  const prompt =
    "You are Lovia, a friendly and careful exam tutor for Ghanaian students. " +
    "Create one original " + exam +
    "-level multiple-choice practice question for the subject " +
    subject + ". " +
    "Question number: " + studyAIQuestionNumber + ". " +

    "Help the student learn the FULL syllabus, not just familiar topics. " +
    "Vary the topic, subtopic, skill and question type across the session. " +

    "For Social Studies, vary citizenship, governance, culture, national " +
    "identity, family, socialisation, environment, sanitation, population, " +
    "resources, economic activities, development, human rights, conflict " +
    "resolution and national history where appropriate. " +

    "For Mathematics, vary numbers, fractions, percentages, algebra, " +
    "geometry, measurement, statistics and probability. " +

    "For English, vary comprehension, grammar, vocabulary, summary, writing " +
    "and literature. " +

    "For Science subjects, vary the major syllabus strands. " +

    "For Management in Living and Food and Nutrition, vary family and " +
    "resource management, food, nutrition, health, clothing, textiles, " +
    "consumer issues and home safety. " +

    "For every other subject, choose a relevant syllabus topic. " +
    "Do not claim an original question is an official past question. " +

    "Return ONLY valid JSON without markdown using exactly these keys: " +
    "question, options, answer, explanation. " +

    "question must be a string. options must be an object with keys A, B, " +
    "C and D and string values. answer must be exactly A, B, C or D. " +
    "explanation must clearly teach why the answer is correct. " +
    "Check that the correct answer matches the explanation.";

  try {
    const reply = await askLoviaStudyAI(prompt);

    const start = reply.indexOf("{");
    const end = reply.lastIndexOf("}");

    if (start === -1 || end === -1) {
      throw new Error(
        "Lovia did not return a valid question. Please try again."
      );
    }

    const questionData = JSON.parse(
      reply.slice(start, end + 1)
    );

    if (
      !questionData.question ||
      !questionData.options ||
      !["A", "B", "C", "D"].includes(questionData.answer) ||
      !questionData.explanation ||
      !["A", "B", "C", "D"].every(
        letter => typeof questionData.options[letter] === "string"
      )
    ) {
      throw new Error(
        "The question format was incomplete. Please try again."
      );
    }

    area.innerHTML = "";

    const heading = document.createElement("h3");

    heading.textContent =
      exam + " Practice — " + subject +
      " · Question " + studyAIQuestionNumber;

    area.appendChild(heading);

    const question = document.createElement("p");
    question.textContent = questionData.question;

    area.appendChild(question);

    const feedback = document.createElement("p");
    feedback.setAttribute("role", "status");

    ["A", "B", "C", "D"].forEach(function(letter) {
      const button = document.createElement("button");

      button.type = "button";

      button.textContent =
        letter + ". " + questionData.options[letter];

      button.className = "study-option";

      button.style.display = "block";
      button.style.width = "100%";
      button.style.padding = "12px";
      button.style.margin = "8px 0";
      button.style.borderRadius = "10px";
      button.style.border = "1px solid #c4b5fd";
      button.style.background = "white";
      button.style.color = "#352052";
      button.style.textAlign = "left";

      button.addEventListener("click", async function() {
        area.querySelectorAll(".study-option").forEach(function(b) {
          b.disabled = true;
        });

        const isCorrect = letter === questionData.answer;

        feedback.textContent = isCorrect
          ? "Correct! 💜 " + questionData.explanation
          : "Not quite. The correct answer is " +
            questionData.answer + ". " +
            questionData.explanation;

        area.appendChild(feedback);

        /* Save progress for the logged-in student. */

        const session = await getValidStudentSession();

        if (session && session.user && session.user.id) {
          try {
            const saveResponse = await fetch(
              SUPABASE_URL + "/rest/v1/study_progress",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "apikey": SUPABASE_PUBLISHABLE_KEY,
                  "Authorization": "Bearer " + session.access_token,
                  "Prefer": "return=minimal"
                },
                body: JSON.stringify({
                  user_id: session.user.id,
                  exam: exam,
                  subject: subject,
                  topic: subject,
                  score: isCorrect ? 1 : 0,
                  total_questions: 1
                })
              }
            );

            if (!saveResponse.ok) {
              console.error(
                "Progress could not be saved:",
                await saveResponse.text()
              );
            }
          } catch (error) {
            console.error("Progress saving error:", error);
          }
        }

        const continueBtn = document.createElement("button");

        continueBtn.type = "button";
        continueBtn.textContent = "Continue ➜";

        continueBtn.style.display = "block";
        continueBtn.style.width = "100%";
        continueBtn.style.padding = "12px";
        continueBtn.style.marginTop = "14px";
        continueBtn.style.border = "none";
        continueBtn.style.borderRadius = "12px";
        continueBtn.style.background = "#8b5cf6";
        continueBtn.style.color = "white";
        continueBtn.style.fontWeight = "bold";

        continueBtn.addEventListener("click", function() {
          studyAIQuestionNumber++;
          loadLoviaStudyQuestion();
        });

        area.appendChild(continueBtn);
      });

      area.appendChild(button);
    });

  } catch (error) {
    area.innerHTML = "";

    const message = document.createElement("p");

    message.textContent =
      "Sorry 💜 " + (error.message || "Something went wrong.");

    area.appendChild(message);

    const retryBtn = document.createElement("button");

    retryBtn.type = "button";
    retryBtn.textContent = "Try Again";

    retryBtn.addEventListener(
      "click",
      loadLoviaStudyQuestion
    );

    area.appendChild(retryBtn);

  } finally {
    studyAILoading = false;
  }
}

if (startStudyBtn) {
  startStudyBtn.addEventListener("click", function() {
    studyAIQuestionNumber = 1;
    loadLoviaStudyQuestion();
  });
}

/* ==========================================
   9. STUDENT ACCOUNT SCREEN
========================================== */

const accountScreen = document.getElementById("accountScreen");
const backFromAccountBtn =
  document.getElementById("backFromAccountBtn");

if (studyScreen && accountScreen) {
  const accountNavBtn = document.createElement("button");

  accountNavBtn.type = "button";
  accountNavBtn.textContent = "👤 Student Account";

  accountNavBtn.style.cssText =
    "display:block;width:100%;padding:12px;margin:12px 0;" +
    "border:0;border-radius:12px;background:#8b5cf6;" +
    "color:white;font-weight:bold;";

  studyScreen.insertBefore(
    accountNavBtn,
    studyScreen.firstChild
  );

  accountNavBtn.addEventListener("click", function() {
    studyScreen.hidden = true;

    if (loviaApp) {
      loviaApp.style.display = "none";
    }

    accountScreen.hidden = false;
  });
}

if (backFromAccountBtn) {
  backFromAccountBtn.addEventListener("click", function() {
    accountScreen.hidden = true;

    if (studyScreen) {
      studyScreen.hidden = false;
    }

    if (loviaApp) {
      loviaApp.style.display = "none";
    }
  });
}

/* ==========================================
   10. STUDENT SIGN-UP AND LOGIN
========================================== */

async function loviaStudentAuth(action) {
  const email = document.getElementById("studentEmail")?.value.trim();
  const password =
    document.getElementById("studentPassword")?.value;

  const message = document.getElementById("accountMessage");

  if (!email || !password) {
    if (message) {
      message.textContent =
        "Please enter your email and password. 💜";
    }

    return;
  }

  if (message) {
    message.textContent = "Please wait... 💜";
  }

  const isSignUp = action === "signup";

  const endpoint = isSignUp
    ? "/auth/v1/signup"
    : "/auth/v1/token?grant_type=password";

  try {
    const response = await fetch(
      SUPABASE_URL + endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify({
          email: email,
          password: password
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.msg ||
        data.message ||
        data.error_description ||
        data.error ||
        "Please check your details and try again."
      );
    }

    if (data.access_token && data.user) {
      saveStudentSession(data);

      if (message) {
        message.textContent =
          "Welcome! You're logged in to Lovia. 💜";
      }

      const status = document.getElementById("accountStatus");

      if (status) {
        status.textContent = "Status: Signed in 💜";
      }

    } else if (isSignUp) {
      if (message) {
        message.textContent =
          "Account created! Please check your email to confirm " +
          "your account, then log in. 💜";
      }

    } else {
      if (message) {
        message.textContent =
          "Please try logging in again.";
      }
    }

  } catch (error) {
    if (message) {
      message.textContent =
        "Sorry 💜 " +
        (error.message || "Something went wrong.");
    }
  }
}

document.getElementById("signUpBtn")?.addEventListener(
  "click",
  function() {
    loviaStudentAuth("signup");
  }
);

document.getElementById("loginBtn")?.addEventListener(
  "click",
  function() {
    loviaStudentAuth("login");
  }
);

/* ==========================================
   11. STUDENT LOGOUT
========================================== */

document.getElementById("logoutBtn")?.addEventListener(
  "click",
  async function() {
    const message = document.getElementById("accountMessage");
    const status = document.getElementById("accountStatus");
    const session = getSavedSession();

    if (session && session.access_token) {
      try {
        const response = await fetch(
          SUPABASE_URL + "/auth/v1/logout",
          {
            method: "POST",
            headers: {
              "apikey": SUPABASE_PUBLISHABLE_KEY,
              "Authorization": "Bearer " + session.access_token
            }
          }
        );

        if (!response.ok) {
          if (message) {
            message.textContent =
              "Logout could not be confirmed. Please try again. 💜";
          }

          return;
        }

      } catch (error) {
        if (message) {
          message.textContent =
            "Connection problem. Please try logging out again. 💜";
        }

        return;
      }
    }

    localStorage.removeItem("lovia_student_session");

    if (status) {
      status.textContent = "Status: Not signed in";
    }

    if (message) {
      message.textContent = "You've logged out successfully. 💜";
    }

    const email = document.getElementById("studentEmail");
    const password = document.getElementById("studentPassword");

    if (email) email.value = "";
    if (password) password.value = "";
  }
);

/* ==========================================
   12. STUDENT DASHBOARD
========================================== */

const loviaDashboardScreen =
  document.getElementById("dashboardScreen");

const loviaDashboardButton =
  document.createElement("button");

loviaDashboardButton.type = "button";
loviaDashboardButton.textContent = "📊 My Study Dashboard";

loviaDashboardButton.style.cssText =
  "width:100%;padding:12px;margin:12px 0;border:0;" +
  "border-radius:12px;background:#8b5cf6;color:white;" +
  "font-size:16px;font-weight:bold;";

if (studyScreen) {
  studyScreen.insertBefore(
    loviaDashboardButton,
    studyScreen.firstChild
  );
}

/* ==========================================
   13. STUDENT LEADERBOARD
========================================== */

const leaderboardScreen =
  document.getElementById("leaderboardScreen");

const loviaLeaderboardButton =
  document.createElement("button");

loviaLeaderboardButton.type = "button";
loviaLeaderboardButton.textContent = "🏆 Student Leaderboard";

loviaLeaderboardButton.style.cssText =
  "width:100%;padding:12px;margin:12px 0;border:0;" +
  "border-radius:12px;background:#ec4899;color:white;" +
  "font-size:16px;font-weight:bold;";

if (studyScreen) {
  studyScreen.insertBefore(
    loviaLeaderboardButton,
    studyScreen.firstChild
  );
}

loviaLeaderboardButton.addEventListener(
  "click",
  async function() {
    if (studyScreen) studyScreen.hidden = true;
    if (loviaDashboardScreen) loviaDashboardScreen.hidden = true;
    if (leaderboardScreen) leaderboardScreen.hidden = false;

    const message =
      document.getElementById("leaderboardMessage");

    if (!message) return;

    message.textContent = "Loading student rankings... 🏆💜";

    try {
      const session = await getValidStudentSession();

      if (!session || !session.access_token) {
        message.textContent =
          "Please log in to view the leaderboard. 💜";
        return;
      }

      const response = await fetch(
        SUPABASE_URL + "/rest/v1/rpc/get_lovia_leaderboard",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": "Bearer " + session.access_token
          },
          body: JSON.stringify({})
        }
      );

      if (!response.ok) {
        console.error(
          "Leaderboard error:",
          await response.text()
        );

        message.textContent =
          "Couldn't load rankings. Please try again. 💜";

        return;
      }

      const students = await response.json();

      if (!Array.isArray(students) || students.length === 0) {
        message.textContent =
          "No students have joined the leaderboard yet. Be the first! 💜";

        return;
      }

      const list = document.createElement("ol");

      students.forEach(function(student, index) {
        const item = document.createElement("li");

        item.style.cssText =
          "list-style:none;display:flex;align-items:center;" +
          "gap:12px;padding:16px;margin:14px 0;" +
          "border-radius:18px;background:white;" +
          "border:1px solid #eadcff;" +
          "box-shadow:0 4px 12px rgba(104,55,155,0.10);";

        const medal = document.createElement("span");

        medal.textContent =
          ["🥇", "🥈", "🥉"][index] || "🏅";

        medal.style.fontSize = "25px";

        const avatar = document.createElement("div");

        avatar.textContent = "👤";

        avatar.style.cssText =
          "width:48px;height:48px;border-radius:50%;" +
          "background:#eadcff;display:flex;align-items:center;" +
          "justify-content:center;font-size:25px;flex-shrink:0;";

        const details = document.createElement("div");

        details.style.flex = "1";
        details.style.minWidth = "0";

        const name = document.createElement("div");

        name.textContent = student.display_name || "Student";
        name.style.cssText =
          "font-weight:bold;color:#7137a8;font-size:17px;";

        const total = Number(student.questions_answered) || 0;
        const correct = Number(student.correct_answers) || 0;

        const accuracy = total > 0
          ? Math.round((correct / total) * 100)
          : 0;

        const score = document.createElement("div");

        score.textContent =
          correct + " correct out of " + total + " questions";

        score.style.cssText =
          "margin-top:6px;color:#554363;";

        const percentage = document.createElement("div");

        percentage.textContent = accuracy + "% accuracy";

        percentage.style.cssText =
          "margin-top:5px;color:#438456;font-weight:bold;";

        details.append(name, score, percentage);
        item.append(medal, avatar, details);
        list.appendChild(item);
      });

      message.replaceChildren(list);

    } catch (error) {
      console.error("Leaderboard error:", error);

      message.textContent =
        "Connection problem. Please try again. 💜";
    }
  }
);

/* ==========================================
   14. LOAD STUDENT DASHBOARD
========================================== */

async function loadLoviaDashboard() {
  const historyArea =
    document.getElementById("dashboardHistory");

  if (!historyArea) return;

  historyArea.textContent = "Loading your progress... 💜";

  const session = await getValidStudentSession();

  if (!session || !session.access_token) {
    historyArea.textContent =
      "Please log in to see your saved progress.";

    document.getElementById("dashboardQuestions").textContent = "—";
    document.getElementById("dashboardCorrect").textContent = "—";
    document.getElementById("dashboardSubjects").textContent = "—";
    document.getElementById("dashboardPercentage").textContent = "—";

    return;
  }

  try {
    const response = await fetch(
      SUPABASE_URL +
      "/rest/v1/study_progress?select=exam,subject,topic,score,total_questions&user_id=eq." +
      encodeURIComponent(session.user.id),
      {
        headers: {
          "apikey": SUPABASE_PUBLISHABLE_KEY,
          "Authorization": "Bearer " + session.access_token
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        "Could not load scores. Please try again."
      );
    }

    const records = await response.json();

    const questions = records.reduce(
      (sum, row) => sum + Number(row.total_questions || 0),
      0
    );

    const correct = records.reduce(
      (sum, row) => sum + Number(row.score || 0),
      0
    );

    const subjects = [
      ...new Set(
        records.map(row => row.subject).filter(Boolean)
      )
    ];

    document.getElementById("dashboardQuestions").textContent =
      questions;

    document.getElementById("dashboardCorrect").textContent =
      correct;

    const percentage = questions > 0
      ? Math.round((correct / questions) * 100)
      : 0;

    document.getElementById("dashboardPercentage").textContent =
      percentage + "%";

    document.getElementById("dashboardSubjects").textContent =
      subjects.length ? subjects.join(", ") : "None yet";

    historyArea.textContent = "";

    if (records.length === 0) {
      historyArea.textContent =
        "No saved practice scores yet. Start studying to see your progress! 📚";

      return;
    }

    const heading = document.createElement("h3");

    heading.textContent = "📝 Recent Practice Results";

    historyArea.appendChild(heading);

    records.slice().reverse().forEach(function(row) {
      const item = document.createElement("div");

      item.textContent =
        (row.subject || "Study") + " — " +
        (row.exam || "") + " — Score: " +
        (row.score ?? 0) + "/" +
        (row.total_questions ?? 1);

      historyArea.appendChild(item);
    });

  } catch (error) {
    console.error("Dashboard error:", error);

    historyArea.textContent =
      error.message || "Something went wrong.";
  }
}

loviaDashboardButton.addEventListener(
  "click",
  function() {
    if (studyScreen) studyScreen.hidden = true;

    if (loviaApp) {
      loviaApp.style.display = "none";
    }

    if (loviaDashboardScreen) {
      loviaDashboardScreen.hidden = false;
    }

    loadLoviaDashboard();
  }
);

document.getElementById("refreshDashboardBtn")
  ?.addEventListener("click", loadLoviaDashboard);

document.getElementById("backFromDashboardBtn")
  ?.addEventListener("click", function() {
    if (loviaDashboardScreen) {
      loviaDashboardScreen.hidden = true;
    }

    if (studyScreen) {
      studyScreen.hidden = false;
    }
  });

document.getElementById("backFromLeaderboardBtn")
  ?.addEventListener("click", function() {
    if (leaderboardScreen) {
      leaderboardScreen.hidden = true;
    }

    if (studyScreen) {
      studyScreen.hidden = false;
    }
  });

/* ==========================================
   15. SAVE LEADERBOARD PROFILE
========================================== */

document.getElementById("saveLeaderboardProfileBtn")
  ?.addEventListener("click", async function() {
    const message =
      document.getElementById("leaderboardProfileMessage");

    const displayName =
      document.getElementById("leaderboardName").value.trim();

    const wantsLeaderboard =
      document.getElementById("leaderboardOptIn").checked;

    if (!displayName || displayName.length > 30) {
      message.textContent =
        "Please enter a nickname of 1–30 characters. 💜";

      return;
    }

    message.textContent = "Saving your profile... 💜";

    try {
      const session = await getValidStudentSession();

      if (!session || !session.user || !session.user.id) {
        message.textContent =
          "Please log in first to save your profile. 💜";

        return;
      }

      const response = await fetch(
        SUPABASE_URL + "/rest/v1/student_profiles?on_conflict=user_id",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": "Bearer " + session.access_token,
            "Prefer": "resolution=merge-duplicates,return=minimal"
          },
          body: JSON.stringify({
            user_id: session.user.id,
            display_name: displayName,
            leaderboard_opt_in: wantsLeaderboard
          })
        }
      );

      if (!response.ok) {
        console.error(
          "Leaderboard profile error:",
          await response.text()
        );

        message.textContent =
          "Couldn't save your profile. Please try again. 💜";

        return;
      }

      message.textContent = wantsLeaderboard
  ? "Profile saved! You're opted in to the leaderboard. 🏆💜"
  : "Profile saved! You're not on the leaderboard yet. 💜";

} catch (error) {
  console.error("Leaderboard profile error:", error);
  message.textContent = "Connection problem. Please try again. 💜";
}
});
/* RESTORE LOVIA STUDENT LOGIN WHEN APP OPENS */
async function restoreLoviaLogin(){
  const status=document.getElementById("accountStatus");
  const message=document.getElementById("accountMessage");
  const email=document.getElementById("studentEmail");
  try{
    const session=await getValidStudentSession();
    if(session&&session.access_token&&session.user){
      if(status)status.textContent="Status: Signed in 💜";
      if(message)message.textContent="Welcome back to Lovia! 💜";
      if(email&&session.user.email)email.value=session.user.email;
      console.log("Lovia student session restored.");
    }else{
      if(status)status.textContent="Status: Not signed in";
      console.log("No valid saved Lovia session found.");
    }
  }catch(error){
    console.error("Lovia login restoration error:",error);
    if(status)status.textContent="Please log in again 💜";
  }
}
restoreLoviaLogin();
function openLoviaThemes() {
  document.getElementById("loviaThemes").style.display = "block";
}

function closeLoviaThemes() {
  document.getElementById("loviaThemes").style.display = "none";
}

function changeLoviaTheme(theme) {
  document.body.style.background = theme;
  document.documentElement.style.background = theme;
  localStorage.setItem("lovia_regular_wallpaper", theme);

  const chat = document.querySelector("main");
  if (chat) {
    chat.style.background = theme;
  }

  localStorage.setItem("lovia_theme", theme);
}

const savedLoviaTheme = localStorage.getItem("lovia_theme");
if (savedLoviaTheme) {
  document.body.style.background = savedLoviaTheme;
}
// 💜 LOVIA LIVE WALLPAPER ENGINE
(function () {
  const canvas = document.getElementById("loviaLiveWallpaper");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let particles = [];
  let animationFrame;
  let currentStyle = localStorage.getItem("lovia_live_wallpaper") || "none";

  const themes = {
    butterflies: ["🦋", "💜", "✨"],
    petals: ["🌸", "🌷", "🌺"],
    galaxy: ["✦", "✧", "⭐", "✨"],
    hearts: ["💗", "💜", "💕", "💖"]
  };

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createParticles() {
    particles = [];
    if (currentStyle === "none") return;

    const count = currentStyle === "galaxy" ? 65 : 22;
    const symbols = themes[currentStyle] || themes.hearts;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: currentStyle === "galaxy" ? 5 + Math.random() * 10 : 12 + Math.random() * 12,
        speed: 0.3 + Math.random() * 1.1,
        drift: (Math.random() - 0.5) * 0.8,
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        opacity: 0.4 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    if (currentStyle !== "none") {
      particles.forEach(p => {
        p.phase += 0.02;
        p.y -= p.speed;
        p.x += p.drift + Math.sin(p.phase) * 0.4;

        if (currentStyle === "petals") p.y += p.speed * 1.5;
        if (currentStyle === "hearts") p.y -= p.speed * 0.5;

        if (p.y < -40) {
          p.y = height + 30;
          p.x = Math.random() * width;
        }

        if (p.x < -30) p.x = width + 20;
        if (p.x > width + 30) p.x = -20;

        ctx.globalAlpha = p.opacity;
        ctx.font = p.size + "px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.symbol, p.x, p.y);
      });

      ctx.globalAlpha = 1;
    }

    animationFrame = requestAnimationFrame(animate);
  }

  function setLiveWallpaper(style) {
    if (!["none", "butterflies", "petals", "galaxy", "hearts"].includes(style)) {
      style = "none";
    }

    currentStyle = style;
    localStorage.setItem("lovia_live_wallpaper", style);
    createParticles();
  }

  window.setLoviaLiveWallpaper = setLiveWallpaper;

  window.addEventListener("resize", () => {
    resizeCanvas();
    createParticles();
  });

  resizeCanvas();
  createParticles();
  animate();
})();
// 💜 Restore Lovia's saved live wallpaper
window.addEventListener("load", () => {
  const savedWallpaper = localStorage.getItem("lovia_live_wallpaper") || "none";
  window.setLoviaLiveWallpaper(savedWallpaper);
});
// 💜 Restore Lovia's saved regular wallpaper
window.addEventListener("load", () => {
  const savedTheme = localStorage.getItem("lovia_regular_wallpaper");
  if (savedTheme) {
    changeLoviaTheme(savedTheme);
  }
});