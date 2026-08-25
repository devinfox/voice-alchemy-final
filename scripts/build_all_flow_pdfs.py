import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

# Page Dimensions (Letter)
PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 36  # 0.5 inch margins
CONTENT_WIDTH = PAGE_WIDTH - (2 * MARGIN)

# Palette
PRIMARY_GOLD = colors.HexColor("#CEB466")
PRIMARY_DARK_GOLD = colors.HexColor("#9C8644")
SECONDARY_PURPLE = colors.HexColor("#7C3AED")
DEEP_PURPLE = colors.HexColor("#4C1D95")
DARK_BG = colors.HexColor("#0F0B1E")
DARK_CARD = colors.HexColor("#171229")
DARK_CARD_BORDER = colors.HexColor("#2E264E")
TEXT_LIGHT = colors.HexColor("#FFFFFF")
TEXT_MUTED = colors.HexColor("#94A3B8")
TEXT_DARK = colors.HexColor("#1E293B")
TEXT_SUBTLE = colors.HexColor("#475569")
ACCENT_BLUE = colors.HexColor("#2563EB")
ACCENT_GREEN = colors.HexColor("#059669")
ROW_BG_LIGHT = colors.HexColor("#F8FAFC")
ROW_BG_ALT = colors.HexColor("#F1F5F9")
BOX_BG_STUDENT = colors.HexColor("#EFF6FF")
BOX_BORDER_STUDENT = colors.HexColor("#BFDBFE")
BOX_BG_TEACHER = colors.HexColor("#FAF5FF")
BOX_BORDER_TEACHER = colors.HexColor("#E9D5FF")

class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas to dynamically compute and render total page count & header/footer."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            return  # Suppress headers/footers on cover page

        self.saveState()
        
        # Header rule & text
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(MARGIN, PAGE_HEIGHT - 30, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 30)
        
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(colors.HexColor("#334155"))
        doc_title = getattr(self, "doc_title", "Voice Alchemy Academy — Platform Architecture & Screen Inventory")
        self.drawString(MARGIN, PAGE_HEIGHT - 24, doc_title.upper())
        
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 24, "SYSTEM OVERVIEW & SCREEN INVENTORY")
        
        # Footer rule & text
        self.line(MARGIN, 32, PAGE_WIDTH - MARGIN, 32)
        self.drawString(MARGIN, 20, "Voice Alchemy Academy • Dual-Sided Vocal Pedagogy & Studio CRM Architecture")
        
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(PAGE_WIDTH - MARGIN, 20, page_text)
        
        self.restoreState()

def create_styles():
    base = getSampleStyleSheet()
    styles = {}
    
    styles["CoverBrand"] = ParagraphStyle(
        "CoverBrand",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=PRIMARY_GOLD,
        spaceAfter=6
    )

    styles["CoverTitle"] = ParagraphStyle(
        "CoverTitle",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=TEXT_LIGHT,
        alignment=0,
        spaceAfter=6
    )
    
    styles["CoverSubtitle"] = ParagraphStyle(
        "CoverSubtitle",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        textColor=PRIMARY_GOLD,
        alignment=0,
        spaceAfter=12
    )
    
    styles["CoverMeta"] = ParagraphStyle(
        "CoverMeta",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12.5,
        textColor=TEXT_MUTED
    )
    
    styles["SectionHeading"] = ParagraphStyle(
        "SectionHeading",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=17,
        textColor=DARK_CARD,
        spaceBefore=10,
        spaceAfter=5
    )

    styles["SubSectionHeading"] = ParagraphStyle(
        "SubSectionHeading",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=SECONDARY_PURPLE,
        spaceBefore=8,
        spaceAfter=3
    )
    
    styles["ScreenNumber"] = ParagraphStyle(
        "ScreenNumber",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=12,
        textColor=SECONDARY_PURPLE,
        spaceAfter=1
    )

    styles["ScreenNumberTeacher"] = ParagraphStyle(
        "ScreenNumberTeacher",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=12,
        textColor=PRIMARY_DARK_GOLD,
        spaceAfter=1
    )

    styles["ScreenTitle"] = ParagraphStyle(
        "ScreenTitle",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=DARK_CARD,
        spaceAfter=3
    )

    styles["RouteTag"] = ParagraphStyle(
        "RouteTag",
        parent=base["Normal"],
        fontName="Courier-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#92400E"),
        alignment=2
    )

    styles["BodyTextCustom"] = ParagraphStyle(
        "BodyTextCustom",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=TEXT_DARK,
        spaceAfter=3
    )

    styles["BodyTextLead"] = ParagraphStyle(
        "BodyTextLead",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=TEXT_DARK,
        spaceAfter=4
    )

    styles["BodyTextMuted"] = ParagraphStyle(
        "BodyTextMuted",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=10,
        textColor=TEXT_SUBTLE,
    )

    styles["Label"] = ParagraphStyle(
        "Label",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=DARK_CARD
    )

    styles["TableHeader"] = ParagraphStyle(
        "TableHeader",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.white,
        alignment=0
    )

    styles["TableCell"] = ParagraphStyle(
        "TableCell",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=TEXT_DARK
    )

    styles["TableRouteCell"] = ParagraphStyle(
        "TableRouteCell",
        parent=base["Normal"],
        fontName="Courier",
        fontSize=7,
        leading=9,
        textColor=colors.HexColor("#92400E")
    )

    return styles

def generate_student_pdf(output_path):
    print(f"\n==========================================", flush=True)
    print(f"GENERATING STUDENT FLOW PDF: {output_path}", flush=True)
    print(f"==========================================", flush=True)
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=38,
        bottomMargin=38
    )

    styles = create_styles()
    story = []

    # =========================================================================
    # 1. COVER PAGE & SYSTEM OVERVIEW
    # =========================================================================
    cover_data = [
        [Paragraph("VOICE ALCHEMY ACADEMY", styles["CoverBrand"])],
        [Paragraph("Student & Vocalist Learning Experience Flow", styles["CoverTitle"])],
        [Paragraph("Complete Application Architecture, Visual Flow Inventory & Vocal Pedagogy Blueprint", styles["CoverSubtitle"])],
        [
            Paragraph(
                "<b>Document Scope:</b> User / Student Portal & Public Onboarding &nbsp;&nbsp;|&nbsp;&nbsp; "
                "<b>Total Screens Documented:</b> 22 Production Views<br/>"
                "<b>Application Engine:</b> Next.js 16 (App Router), Tailwind CSS v4, Supabase SSR Auth & Realtime, WebAudio DSP Pitch & Rhythm Telemetry, TipTap Lyric Suite<br/>"
                "<b>Document Purpose:</b> In-depth architectural breakdown and complete screen-by-screen inventory explaining what the entire platform is, the student's learning journey, and every functional flow.",
                styles["CoverMeta"]
            )
        ]
    ]
    cover_table = Table(cover_data, colWidths=[CONTENT_WIDTH])
    cover_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), DARK_BG),
        ('PADDING', (0, 0), (-1, -1), 16),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (-1, -1), 1.5, PRIMARY_GOLD),
    ]))
    story.append(cover_table)
    story.append(Spacer(1, 10))

    # Detailed Application Overview Box: "What the entire app is" & "Which side you're on"
    overview_text_1 = (
        "<b>WHAT THE ENTIRE APP IS:</b> Voice Alchemy Academy is an all-in-one elite vocal mentorship platform, digital vocal conservatory, "
        "and studio management CRM designed to transform singing instruction. The platform uniquely bridges high-level artistic vocal pedagogy "
        "with real-time WebAudio digital signal processing (DSP) telemetry, collaborative live video classrooms, structured multi-week masterclasses, "
        "creative songwriting workspaces, and complete studio CRM marketing automation. The dual-sided architecture connects students with world-class vocal mentors "
        "while providing autonomous daily training tools that measure pitch onset speed, intonation accuracy, vibrato stability, and rhythmic precision."
    )
    overview_text_2 = (
        "<b>WHICH SIDE YOU'RE ON (STUDENT / USER SIDE):</b> This document focuses exclusively on the <b>Student & Vocalist Experience</b>. "
        "On this side of the platform, aspiring and professional singers explore public onboarding, access personal telemetry dashboards, "
        "launch live 1-on-1 lessons with their vocal coach, study synchronized lesson notes with audio feedback, enroll in structured curriculum masterclasses, "
        "practice precision pitch/rhythm/scale drills in the Training Center with AI Coach diagnostics, write and arrange original music in the Songwriting Studio, "
        "discover new vocal coaches in the marketplace, and manage their recurring lesson schedules and audio hardware preferences."
    )
    
    app_summary_table = Table(
        [
            [Paragraph(overview_text_1, styles["BodyTextCustom"])],
            [Paragraph(overview_text_2, styles["BodyTextCustom"])]
        ],
        colWidths=[CONTENT_WIDTH]
    )
    app_summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BOX_BG_STUDENT),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor("#F0FDF4")),
        ('BOX', (0, 0), (-1, -1), 1, BOX_BORDER_STUDENT),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, BOX_BORDER_STUDENT),
    ]))
    story.append(app_summary_table)
    story.append(Spacer(1, 10))

    # Table of Contents
    story.append(Paragraph("Student Experience — Complete Screen Inventory", styles["SectionHeading"]))
    
    student_screens = [
        ("01", "Public Gateway & Landing Page", "/", "screenshots/student_flow/01_homepage.png",
         "The academy's public landing portal introducing the Voice Alchemy philosophy, vocal pedagogy benefits, and dual role entry cards ('I want to Learn' vs 'I want to Teach').",
         "Hero banner with glowing typography, dual-track CTA cards with icons, background ambient lighting, responsive navigation header.",
         "Public gateway leading to student enrollment (/signup?role=student), teacher application (/signup?role=teacher), or authentication (/login)."),

        ("02", "Unified Sign-In Portal", "/login", "screenshots/student_flow/02_login_page.png",
         "Secure authentication portal for students, vocal coaches, and academy administrators with email/password authentication, Google OAuth, and Microsoft SSO.",
         "Glassmorphism auth container, form validation, password visibility toggles, social OAuth buttons, developer quick-login switcher.",
         "Authenticates credentials via Supabase SSR Auth, verifies user role in profiles table, and routes student to /dashboard."),

        ("03", "Student Registration & Onboarding", "/signup?role=student", "screenshots/student_flow/03_signup_student.png",
         "Student account registration portal allowing new vocalists to join the academy, specify vocal goals, and establish secure login credentials.",
         "Role-scoped header badge ('Student Registration'), name/email/password inputs, terms acceptance checkbox, redirection pathways.",
         "Creates auth.users record, triggers handle_new_user database function, seeds student profile with 'student' role, and initializes learning dashboard."),

        ("04", "Teacher Application & Studio Registration", "/signup?role=teacher", "screenshots/student_flow/04_signup_teacher.png",
         "Instructor enrollment gateway for professional vocal coaches applying to offer lessons, publish courses, and manage studios on the platform.",
         "Role-scoped header badge ('Teacher Registration'), coach credentials form, experience profile inputs, authentication pathways.",
         "Creates instructor profile with 'teacher' role, provisions studio CRM workspace, initializes email subdomain routing, and creates lesson calendar."),

        ("05", "Self-Service Password Recovery", "/forgot-password", "screenshots/student_flow/05_forgot_password.png",
         "Self-service password recovery portal dispatching secure reset links and one-time verification tokens to the user's registered email address.",
         "Single-purpose email input container, gold CTA button, return-to-login navigation link, status notifications.",
         "Calls Supabase auth.resetPasswordForEmail API and redirects to secure reset confirmation screen upon submission."),

        ("06", "Secure Password Reset Portal", "/reset-password", "screenshots/student_flow/06_reset_password.png",
         "Password modification interface allowing users arriving from authenticated recovery links to establish new secure credentials.",
         "New password input field, confirmation field, real-time password strength meter, submit button.",
         "Updates user credentials via supabase.auth.updateUser and redirects user to /login with success feedback."),

        ("07", "Student Command Dashboard", "/dashboard", "screenshots/student_flow/07_student_dashboard.png",
         "The central learning cockpit for students featuring next lesson countdowns, active teacher coaching cards, practice trainer shortcuts, and vocal telemetry summary.",
         "Personalized welcome header, 'Next Lesson' hero card with 'Go to Class' launcher, 3-tool practice arena (Pitch, Rhythm, Scales), telemetry preview.",
         "Fetches student bookings, aggregates weekly pitch/rhythm practice sessions, displays coach assigned homework, and provides 1-click video classroom launch."),

        ("08", "Student 'My Lessons' Directory", "/dashboard/my-lessons", "screenshots/student_flow/08_student_my_lessons.png",
         "Dedicated coaching hub listing all active and pending 1-on-1 teacher relationships, weekly recurring schedules, and direct classroom access links.",
         "Teacher profile cards with avatars, bios, recurring schedule pills (e.g. 'Every Wednesday at 4:00 PM'), timezone tags, 'Go to Class' button.",
         "Queries bookings table where student_id matches logged-in user, joins instructor profile details, and routes to live session or archived notes."),

        ("09", "Student Lesson Notes & Practice Workspace", "/dashboard/my-lessons/[teacherId]", "screenshots/student_flow/09_student_lesson_notes_detail.png",
         "Comprehensive lesson notes archive and practice portal detailing instructor feedback, vocal warmup routines, homework drills, and audio recordings.",
         "AI summary tag, timestamped topic pills, instructor feedback bullet list, practice assignment checklists, audio playback links, date navigator.",
         "Fetches session_notes and notes_archive tables, renders collaborative TipTap lesson content, and tracks student practice completion."),

        ("10", "Academy Masterclass & Course Catalog", "/dashboard/courses", "screenshots/student_flow/10_student_courses_catalog.png",
         "Academy course directory showcasing structured vocal training curricula (e.g., Beginner Vocal Foundations, Belt Technique, Breath Mastery).",
         "Course cards grid with thumbnail art, skill level badges (Beginner/Intermediate/Advanced), module/lesson count pills, unlock status.",
         "Queries courses and course_enrollments tables, calculates student progress percentage, and allows 1-click syllabus exploration."),

        ("11", "Course Walkthrough & Syllabus Overview", "/dashboard/courses/[slug]", "screenshots/student_flow/11_student_course_walkthrough_overview.png",
         "Interactive course syllabus player displaying hierarchical sections, module objectives, instructor credentials, and completion milestones.",
         "Collapsible sidebar curriculum tree, module progress indicators, instructor bio card, course requirements metadata, start lesson CTA.",
         "Loads course, modules, and lessons hierarchy with ordering indices; maintains completed lesson state in user metadata."),

        ("12", "Course Interactive Practice Drill View", "/dashboard/courses/[slug] (Lesson)", "screenshots/student_flow/12_student_course_walkthrough_lesson.png",
         "Execution view for structured vocal lessons featuring instructional exercise instructions, vocal safety guidance, drill checklists, and video player.",
         "Lesson header with duration, key takeaway callout boxes, practical drill checklist, previous/next lesson pagination controls.",
         "Renders lesson body content, provides interactive exercise completion tracking, and updates course completion metrics upon completion."),

        ("13", "Training Center — Vocal Telemetry Overview", "/dashboard/training-center", "screenshots/student_flow/13_student_training_center_overview.png",
         "Vocal telemetry command center summarizing 4 core metrics: Target Accuracy %, Voice Stability %, Rhythm Accuracy %, and Scale Interval Mastery.",
         "4-stat telemetry cards grid, historical progress chart, recent lesson notes integration card, AI Coach Insights diagnostic summary card.",
         "Aggregates pitch_training_sessions, rhythm_training_sessions, and scale_training_sessions to calculate overall vocal improvement scores."),

        ("14", "Training Center — Precision Pitch Trainer", "/dashboard/training-center (Pitch)", "screenshots/student_flow/14_student_training_center_pitch_trainer.png",
         "Precision intonation analytics laboratory tracking pitch onset latency (ms), target accuracy %, sustain stability, and sharp/flat tendencies.",
         "Pitch scorecards, sharp vs. flat tendency indicator pill, onset speed badge (ms), historical practice session logs with detailed metrics.",
         "Stores microphone audio analysis data, calculates cents deviation from target MIDI notes, and graphs pitch stability trends over time."),

        ("15", "Training Center — Metronome Rhythm Trainer", "/dashboard/training-center (Rhythm)", "screenshots/student_flow/15_student_training_center_rhythm_trainer.png",
         "Timing precision analytics suite evaluating student on-beat accuracy %, millisecond timing offsets, consistency, and early/late tendencies.",
         "Rhythm scorecard, timing offset delta (ms), BPM practice distribution breakdown, recent rhythm session log with scoring pills.",
         "Analyzes user tap/sing audio transients against WebAudio clock pulses to calculate microsecond timing drift and groove consistency."),

        ("16", "Training Center — Vocal Scale Progression", "/dashboard/training-center (Scales)", "screenshots/student_flow/16_student_training_center_scales.png",
         "Scale run analytics tracking sequence accuracy, root note diversity, ascending/descending pitch accuracy, and tempo progression.",
         "Scale training scorecards, unique scale variety counter, tempo BPM distribution, recent scale drill history table with accuracy breakdown.",
         "Tracks exercises across Major, Natural Minor, Harmonic Minor, Pentatonic, and Raga scales to measure interval agility and vocal agility."),

        ("17", "Training Center — AI Vocal Coach Diagnostic", "/dashboard/training-center (AI Modal)", "screenshots/student_flow/17_student_training_center_ai_panel.png",
         "AI Vocal Coach modal synthesizing lesson transcripts, intonation data, and pitch telemetry into personalized vocal health & technique feedback.",
         "Slideout modal, Analysis scope selector (Weekly vs. Comprehensive), diagnostic summary, Strengths & Focus Areas pills, recommended drills.",
         "Invokes /api/pitch-training/progress AI analysis pipeline using OpenAI models to synthesize telemetry and lesson notes into coaching advice."),

        ("18", "Songwriting Studio — Project Hub", "/dashboard/songwriting", "screenshots/student_flow/18_student_songwriting_list.png",
         "Creative studio where vocalists organize original song projects, lyric drafts, vibe tags, mood boards, and audio scratchpad recordings.",
         "Search and filter controls, song project cards with vibe/genre/mood tags, word count, draft status pills, 'New Song' creation button.",
         "Queries songwriting_documents table where user_id matches student, providing instant creation, editing, and archiving of compositions."),

        ("19", "Songwriting Editor & AI Co-Writer", "/dashboard/songwriting/[id]", "screenshots/student_flow/19_student_songwriting_editor.png",
         "Rich text lyric editor powered by TipTap engine featuring inspiration storyboards, mood settings, audio scratchpad, and AI lyric feedback.",
         "Rich text formatting toolbar (verse/chorus tags), song metadata header, word counter, AI feedback sidebar with rewrite & rhyming suggestions.",
         "Synchronizes lyric content in real time, saves document revisions, and allows vocalists to generate creative suggestions with AI."),

        ("20", "Coach Discovery Directory & Marketplace", "/dashboard/find-teacher", "screenshots/student_flow/20_student_find_teacher.png",
         "Academy marketplace allowing students to browse certified vocal coach profiles, bios, specialties, and submit 1-on-1 coaching requests.",
         "Search input, instructor cards with avatars, coach names, specialty tags (Pop, Classical, Belt, Breathwork), request status badges.",
         "Queries instructor profiles, allows students to submit lesson requests, and creates pending bookings in the teacher approval queue."),

        ("21", "Student Weekly Schedule & Calendar", "/dashboard/calendar", "screenshots/student_flow/21_student_calendar.png",
         "Personal calendar interface displaying confirmed weekly coaching sessions, timezone conversions, and 1-click video classroom links.",
         "Weekly and monthly calendar grid, confirmed lesson event blocks, timezone indicator, 'Go to Class' direct classroom launch link.",
         "Synchronizes student booking dates and recurring slot times into an interactive visual timetable."),

        ("22", "Student Profile & Audio Settings", "/dashboard/settings", "screenshots/student_flow/22_student_settings.png",
         "Account management screen for configuring student profile details, display name, avatar, timezone, and audio input calibration preferences.",
         "Profile avatar initial badge, editable name form, email display, role tag ('Student'), timezone selector, security preferences.",
         "Updates user profile in profiles table, persists audio calibration settings, and manages account authentication parameters.")
    ]

    toc_data = [
        [
            Paragraph("<b>#</b>", styles["TableHeader"]),
            Paragraph("<b>Screen Title</b>", styles["TableHeader"]),
            Paragraph("<b>Route / URL</b>", styles["TableHeader"]),
            Paragraph("<b>Functional Domain</b>", styles["TableHeader"])
        ]
    ]
    for num, title, route, _, desc, _, _ in student_screens:
        toc_data.append([
            Paragraph(num, styles["TableCell"]),
            Paragraph(f"<b>{title}</b>", styles["TableCell"]),
            Paragraph(route, styles["TableRouteCell"]),
            Paragraph(desc[:80] + "...", styles["TableCell"])
        ])

    toc_table = Table(toc_data, colWidths=[20, 145, 165, CONTENT_WIDTH - 330])
    toc_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), DARK_CARD),
        ('PADDING', (0, 0), (-1, -1), 2.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [ROW_BG_LIGHT, ROW_BG_ALT]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(toc_table)
    story.append(PageBreak())

    # =========================================================================
    # 2. SCREEN-BY-SCREEN DETAILS (1 PAGE PER SCREEN)
    # =========================================================================
    for num, title, route, img_path, desc, comps, arch in student_screens:
        screen_elements = []
        
        # Header banner for screen
        header_table = Table([
            [
                Paragraph(f"SCREEN {num} &nbsp;•&nbsp; STUDENT / USER FLOW", styles["ScreenNumber"]),
                Paragraph(f"Route: {route}", styles["RouteTag"])
            ],
            [
                Paragraph(title, styles["ScreenTitle"]),
                Paragraph("", styles["TableCell"])
            ]
        ], colWidths=[CONTENT_WIDTH * 0.62, CONTENT_WIDTH * 0.38])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
            ('PADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 1), (-1, 1), 3),
        ]))
        screen_elements.append(header_table)
        screen_elements.append(HRFlowable(width="100%", thickness=1, color=PRIMARY_GOLD, spaceAfter=5, spaceBefore=1))

        # High-resolution Screenshot Image
        if os.path.exists(img_path):
            img = RLImage(img_path, width=CONTENT_WIDTH, height=270)
            screen_elements.append(img)
            screen_elements.append(Spacer(1, 5))
        else:
            screen_elements.append(Paragraph(f"[Screenshot image pending: {img_path}]", styles["BodyTextMuted"]))
            screen_elements.append(Spacer(1, 5))

        # Structured Details Table: What it is, Key Components, Architecture
        details_data = [
            [
                Paragraph("<b>Screen & Flow Purpose:</b>", styles["Label"]),
                Paragraph(desc, styles["BodyTextCustom"])
            ],
            [
                Paragraph("<b>UI Components & Elements:</b>", styles["Label"]),
                Paragraph(comps, styles["BodyTextCustom"])
            ],
            [
                Paragraph("<b>Data & Architectural Layer:</b>", styles["Label"]),
                Paragraph(arch, styles["BodyTextCustom"])
            ]
        ]
        details_table = Table(details_data, colWidths=[125, CONTENT_WIDTH - 125])
        details_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor("#F1F5F9")),
            ('BACKGROUND', (1, 0), (1, 0), colors.HexColor("#FAFAFA")),
            ('BACKGROUND', (1, 1), (1, 1), colors.HexColor("#F8FAFC")),
            ('BACKGROUND', (1, 2), (1, 2), colors.HexColor("#EFF6FF")),
            ('PADDING', (0, 0), (-1, -1), 3.5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        screen_elements.append(details_table)
        
        story.append(KeepTogether(screen_elements))
        story.append(PageBreak())

    # =========================================================================
    # 3. STUDENT ARCHITECTURE SYNTHESIS & WORKFLOW SUMMARY
    # =========================================================================
    story.append(Paragraph("Student Learning Experience Architecture Summary", styles["SectionHeading"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY_GOLD, spaceAfter=8, spaceBefore=2))

    summary_blocks = [
        ("1. The Continuous Daily Practice Loop",
         "The student experience is anchored around a continuous feedback loop: Daily Practice (Pitch/Rhythm/Scales) -> Telemetry Collection -> Weekly Live Coaching (1-on-1 Classroom with shared notes) -> Structured Homework Drills -> Creative Application in the Songwriting Studio. This loop ensures rapid vocal growth with objective metrics."),
        
        ("2. Real-Time WebAudio Digital Signal Processing (DSP)",
         "The in-browser pitch detection algorithms compute fundamental frequency (f0) in real time using autocorrelation and YIN algorithms, measuring onset latency in milliseconds, pitch stability, and semitone deviation against target MIDI pitches. Rhythm metrics analyze audio transient attacks against sample-accurate WebAudio timers."),
        
        ("3. Seamless Live Classroom & Shared Lesson Artifacts",
         "During 1-on-1 vocal lessons with coaches, students interact via a real-time collaborative TipTap text editor with bidirectional Yjs synchronization. When the coach highlights a vocal exercise or assigns audio drills, these immediately become part of the student's persistent lesson history and practice reminders."),
        
        ("4. Creative Songwriting & Composition Integration",
         "Unlike traditional singing tools that isolate technique from artistry, Voice Alchemy Academy integrates a full lyric studio with AI co-writing assistance. Singers can draft verses, test rhyming schemes, record audio voice memos directly into stanzas, and tag songs with mood and genre attributes.")
    ]

    for title, text in summary_blocks:
        card = Table([
            [Paragraph(f"<b>{title}</b>", ParagraphStyle("SumH", parent=styles["SubSectionHeading"], textColor=DEEP_PURPLE))],
            [Paragraph(text, styles["BodyTextCustom"])]
        ], colWidths=[CONTENT_WIDTH])
        card.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#EFF6FF")),
            ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor("#F8FAFC")),
            ('BOX', (0, 0), (-1, -1), 1, BOX_BORDER_STUDENT),
            ('PADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(card)
        story.append(Spacer(1, 6))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Student Flow PDF generated successfully: {output_path} ({os.path.getsize(output_path):,} bytes)", flush=True)


def generate_teacher_pdf(output_path):
    print(f"\n==========================================", flush=True)
    print(f"GENERATING TEACHER FLOW PDF: {output_path}", flush=True)
    print(f"==========================================", flush=True)
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=38,
        bottomMargin=38
    )

    styles = create_styles()
    story = []

    # =========================================================================
    # 1. COVER PAGE & SYSTEM OVERVIEW
    # =========================================================================
    cover_data = [
        [Paragraph("VOICE ALCHEMY ACADEMY", styles["CoverBrand"])],
        [Paragraph("Teacher & Administrator Studio CRM Flow", styles["CoverTitle"])],
        [Paragraph("Complete Studio Operations, Pedagogical Workspace & Marketing Automation Blueprint", styles["CoverSubtitle"])],
        [
            Paragraph(
                "<b>Document Scope:</b> Teacher / Vocal Coach & Academy Administrator Experience &nbsp;&nbsp;|&nbsp;&nbsp; "
                "<b>Total Screens Documented:</b> 22 Production Views<br/>"
                "<b>Application Engine:</b> Next.js 16 (App Router), Supabase SSR Auth & DB, SendGrid CRM & Inbound Webhooks, TipTap Realtime Collaborative Notes, Funnel Sequence Builder<br/>"
                "<b>Document Purpose:</b> In-depth architectural breakdown and complete screen-by-screen inventory explaining what the entire platform is, the instructor's studio management workflows, and every administrative flow.",
                styles["CoverMeta"]
            )
        ]
    ]
    cover_table = Table(cover_data, colWidths=[CONTENT_WIDTH])
    cover_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), DARK_BG),
        ('PADDING', (0, 0), (-1, -1), 16),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (-1, -1), 1.5, PRIMARY_GOLD),
    ]))
    story.append(cover_table)
    story.append(Spacer(1, 10))

    # Detailed Application Overview Box: "What the entire app is" & "Which side you're on"
    overview_text_1 = (
        "<b>WHAT THE ENTIRE APP IS:</b> Voice Alchemy Academy is a modern dual-sided vocal mentorship ecosystem that combines "
        "precision voice training science with full enterprise studio CRM automation. It unites students and instructors under a single intelligent umbrella. "
        "While students receive real-time pitch feedback, masterclasses, and songwriting studios, instructors and academy administrators operate an advanced "
        "business suite complete with live synchronized video lesson notes, student practice telemetry diagnostics, automated marketing nurture funnels, "
        "an integrated SendGrid email client with domain authentication, curriculum builders, and master calendar scheduling."
    )
    overview_text_2 = (
        "<b>WHICH SIDE YOU'RE ON (TEACHER & ADMIN SIDE):</b> This document focuses exclusively on the <b>Teacher, Vocal Coach & Studio Administrator Experience</b>. "
        "On this side of the platform, instructors manage their active student rosters, vet incoming coaching applicants in the request pipeline, "
        "conduct live lessons in real time with collaborative TipTap notes and AI homework summarization, author custom multi-week courses, "
        "manage studio communications through a full-featured SendGrid email client, build automated multi-step marketing funnels, "
        "monitor studio-wide student telemetry, configure DNS domain verification, and oversee the master student directory."
    )
    
    app_summary_table = Table(
        [
            [Paragraph(overview_text_1, styles["BodyTextCustom"])],
            [Paragraph(overview_text_2, styles["BodyTextCustom"])]
        ],
        colWidths=[CONTENT_WIDTH]
    )
    app_summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BOX_BG_TEACHER),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor("#FDF2F8")),
        ('BOX', (0, 0), (-1, -1), 1, BOX_BORDER_TEACHER),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, BOX_BORDER_TEACHER),
    ]))
    story.append(app_summary_table)
    story.append(Spacer(1, 10))

    # Table of Contents
    story.append(Paragraph("Teacher & Admin Experience — Complete Screen Inventory", styles["SectionHeading"]))
    
    teacher_screens = [
        ("01", "Teacher & Admin Sign-In Portal", "/login", "screenshots/teacher_flow/01_teacher_login.png",
         "Unified sign-in portal allowing vocal coaches and academy administrators to securely log in to access their studio workspace.",
         "Glassmorphic auth container, email/password inputs, role detection logic, SSO buttons, quick dev switcher.",
         "Authenticates credentials with Supabase Auth, verifies 'teacher' or 'admin' role in profiles table, and redirects to studio dashboard."),

        ("02", "Studio Command Cockpit", "/dashboard", "screenshots/teacher_flow/02_teacher_dashboard.png",
         "The instructor's primary operational command center featuring active student counters, pending request notifications, upcoming live class shortcuts, and quick links.",
         "Active students metric card, pending coaching requests counter, 'Go to Class' student launcher with avatars and lesson times, quick actions grid.",
         "Aggregates confirmed student bookings, incoming coaching requests, and scheduled daily lessons for 1-click classroom initiation."),

        ("03", "Teacher 'My Students' CRM Directory", "/dashboard/students", "screenshots/teacher_flow/03_teacher_my_students.png",
         "Comprehensive student CRM roster tracking student engagement levels (High/Medium/Low), pitch accuracy %, practice streak flames, and lesson histories.",
         "Search and filter controls, student cards with engagement pills, pitch accuracy % tags, streak counter, 'View Notes' & 'Go to Class' actions.",
         "Queries bookings table where instructor_id matches teacher, calculates aggregate practice scores, and enables fast student drill auditing."),

        ("04", "Inbound Student Coaching Requests", "/dashboard/students/requests", "screenshots/teacher_flow/04_teacher_student_requests.png",
         "Intake and vetting pipeline for reviewing prospective students, evaluating vocal experience, and confirming weekly lesson times.",
         "Request cards with applicant names, vocal experience backgrounds, requested lesson frequency, Accept & Decline action buttons.",
         "Manages pending bookings state, transitions approved applicants to 'confirmed' status, and automatically provisions their student profile."),

        ("05", "360° Student Profile & Practice Diagnostic", "/dashboard/students/[id]", "screenshots/teacher_flow/05_teacher_student_detail_profile.png",
         "Comprehensive 360-degree student diagnostic view presenting contact info, weekly recurring slot times, pitch accuracy trends, and historical lesson logs.",
         "Student summary header, recurring schedule badge, session view tabs, pitch & rhythm trend charts, archived notes history list.",
         "Aggregates student practice telemetry from pitch_training_sessions and notes_archive to provide coaches with complete diagnostic context."),

        ("06", "Live Classroom & Collaborative Notes Workspace", "/dashboard/students/[id] (Live)", "screenshots/teacher_flow/06_teacher_live_class_notes_workspace.png",
         "Real-time synchronized lesson notepad used during live vocal coaching. Features collaborative TipTap rich text, class timer, audio recorder, and AI homework generator.",
         "'Start Class' / 'End Class' session toggle, live elapsed timer, rich text formatting toolbar, AI summary generation button, homework assignment block.",
         "Synchronizes live edits via Yjs WebSockets, records audio memos to Supabase Storage, and uses OpenAI to generate post-lesson practice summaries."),

        ("07", "Curriculum & Course Studio Management", "/dashboard/courses", "screenshots/teacher_flow/07_teacher_courses_management.png",
         "Academy course catalog management where instructors author, edit, and organize masterclass modules, video drills, and student enrollment rules.",
         "Course cards grid, skill level pills, lesson count badges, published/draft status tags, 'Create Course' builder launcher.",
         "Queries courses table, provides full CRUD capabilities over curriculum modules, and controls academy-wide student access permissions."),

        ("08", "Curriculum Section & Lesson Structure Editor", "/dashboard/courses/beginner-vocal-foundations", "screenshots/teacher_flow/08_teacher_course_curriculum_editor.png",
         "Curriculum inspection and module structuring interface detailing sections, lesson summaries, key takeaways, and practice exercises.",
         "Section tree navigation hierarchy, lesson body content viewer, exercise checklist editor, key takeaways card, module ordering tools.",
         "Persists lesson definitions, video URLs, and exercise metadata to modules and lessons tables in the Supabase database."),

        ("09", "Teacher Email CRM — Inbox", "/dashboard/email", "screenshots/teacher_flow/09_teacher_email_inbox.png",
         "Full-featured SendGrid email client integrated into the studio CRM for handling student inquiries, lesson reminders, and studio communications.",
         "Email sidebar (Inbox, Sent, Drafts, Snoozed, Starred, Archive, Trash), thread preview list with sender avatars, full-text search bar.",
         "Synchronizes with SendGrid Inbound Parse Webhooks and email_threads table to deliver two-way studio email capabilities."),

        ("10", "Rich Text Email Composer & AI Assistant", "/dashboard/email/compose", "screenshots/teacher_flow/10_teacher_email_compose.png",
         "Professional email authoring environment featuring student recipient autocomplete, template insertion, attachment manager, and AI drafting assistance.",
         "Recipient picker with student contact search, subject line input, rich text formatting toolbar, attachment uploader, Send & Schedule buttons.",
         "Validates verified sender domains, generates AI email drafts, and dispatches outbound messages via the SendGrid Mail API."),

        ("11", "Sent Studio Communications Directory", "/dashboard/email/sent", "screenshots/teacher_flow/11_teacher_email_sent.png",
         "Archive of all outbound student communications, newsletter broadcasts, and lesson follow-up emails sent by the instructor.",
         "Sent message list with recipient names, subject lines, delivery timestamps, read status indicators, search and filter controls.",
         "Queries email_messages where direction is outbound and maps messages to student recipient profiles."),

        ("12", "Saved Email Drafts Hub", "/dashboard/email/drafts", "screenshots/teacher_flow/12_teacher_email_drafts.png",
         "Draft repository where partially written student emails, announcements, and feedback notes are securely auto-saved.",
         "Draft thread cards with subject previews, last edited relative timestamps, 1-click resume editor triggers, delete actions.",
         "Persists unsent message state in email_drafts table with auto-save debouncing to prevent work loss."),

        ("13", "Starred & High-Priority Student Threads", "/dashboard/email/starred", "screenshots/teacher_flow/13_teacher_email_starred.png",
         "Filtered conversation directory organizing flagged student threads, urgent inquiries, and high-priority studio discussions.",
         "Starred thread items, priority badges, sender details, snippet previews, quick unstar toggle actions.",
         "Filters email_threads where is_starred is true for the active instructor account."),

        ("14", "Email Thread Conversation View", "/dashboard/email/[threadId]", "screenshots/teacher_flow/14_teacher_email_thread_detail.png",
         "Detailed email message thread viewer showing full chronological message history, student metadata, attachments, and quick-reply composer.",
         "Message thread header, chronological message cards, student avatar, formatted email HTML body, quick-reply text box with Send button.",
         "Fetches full thread messages from email_messages table, marks unread messages as read, and supports rich replies."),

        ("15", "Studio Email Templates Library", "/dashboard/email-templates?tab=templates", "screenshots/teacher_flow/15_teacher_email_templates.png",
         "Reusable email template library containing pre-written studio communications (lesson confirmations, recital invites, vocal warmup tips).",
         "Template cards grid, category tags, preview triggers, template editor drawer, 'New Template' creation button.",
         "Stores HTML templates in email_templates table and enables 1-click merge insertion into the email composer."),

        ("16", "Marketing Funnels & Sequence Automation", "/dashboard/email-templates?tab=funnels", "screenshots/teacher_flow/16_teacher_email_funnels.png",
         "Automated email nurture sequence builder for student onboarding, lead follow-ups, and masterclass promotions.",
         "Funnel sequence cards with step counts, trigger rules (e.g. 'On Student Signup'), active enrollment counters, funnel editor trigger.",
         "Executes automated email sequences via email_funnels and email_funnel_steps tables triggered by system events."),

        ("17", "Teacher Master Schedule & Calendar", "/dashboard/calendar", "screenshots/teacher_flow/17_teacher_calendar_schedule.png",
         "Master studio scheduling interface displaying confirmed student lesson slots, recurring appointments, and open studio availability.",
         "Interactive weekly calendar grid, student appointment blocks with student names and times, timezone configuration pills.",
         "Aggregates recurring lesson schedules from bookings table and calculates daily coaching capacity."),

        ("18", "Studio-Wide Vocal Telemetry Analytics", "/dashboard/training-center", "screenshots/teacher_flow/18_teacher_training_center_analytics.png",
         "Studio-wide vocal telemetry dashboard allowing instructors to monitor aggregate student pitch accuracy, rhythm consistency, and scale mastery.",
         "Studio telemetry scorecards, AI coach diagnostic summary, recent lesson summaries, AI analysis trigger button.",
         "Aggregates cross-student performance metrics to identify common pitch/rhythm challenges across the studio roster."),

        ("19", "Teacher Studio Profile & Coaching Settings", "/dashboard/settings", "screenshots/teacher_flow/19_teacher_settings.png",
         "Studio configuration portal for managing teacher bio, display name, public avatar, timezone, and coaching preferences.",
         "Profile avatar initial badge, editable name form, email display, role badge ('Teacher/Admin'), timezone selector.",
         "Updates instructor metadata in profiles table and configures studio booking defaults."),

        ("20", "Admin Master Student Directory & Roster", "/dashboard/admin/students", "screenshots/teacher_flow/20_admin_student_directory.png",
         "Master administrative oversight directory providing high-level visibility across all registered academy students, enrollments, and roles.",
         "Master student table with avatars, full names, registration timestamps, role tags ('Student'), full academy student count.",
         "Executes administrative queries across profiles and auth.users tables with role-based access control (RBAC)."),

        ("21", "SendGrid Domain Verification & DNS Settings", "/dashboard/email/settings/domains", "screenshots/teacher_flow/21_teacher_email_settings_domains.png",
         "Email infrastructure management screen for verifying custom studio sending domains, DKIM keys, SPF records, and MX routing.",
         "Domain status card, verification badge ('Verified' / 'Pending'), DNS record details (Type, Host, Value), 'Verify DNS' action button.",
         "Interfaces with SendGrid Whitelabel Domain APIs to authenticate email deliverability for custom studio domains."),

        ("22", "Connected Email Accounts & Mailbox Manager", "/dashboard/email/settings/accounts", "screenshots/teacher_flow/22_teacher_email_settings_accounts.png",
         "Mailbox configuration hub for managing instructor sending addresses (e.g. hello@voicealchemyacademy.com), display names, and signatures.",
         "Connected account cards, primary mailbox badge, display name editor, custom email signature editor, auto-reply configuration.",
         "Persists instructor email account settings to email_accounts table and sets primary sending identity.")
    ]

    toc_data = [
        [
            Paragraph("<b>#</b>", styles["TableHeader"]),
            Paragraph("<b>Screen Title</b>", styles["TableHeader"]),
            Paragraph("<b>Route / URL</b>", styles["TableHeader"]),
            Paragraph("<b>Functional Domain</b>", styles["TableHeader"])
        ]
    ]
    for num, title, route, _, desc, _, _ in teacher_screens:
        toc_data.append([
            Paragraph(num, styles["TableCell"]),
            Paragraph(f"<b>{title}</b>", styles["TableCell"]),
            Paragraph(route, styles["TableRouteCell"]),
            Paragraph(desc[:80] + "...", styles["TableCell"])
        ])

    toc_table = Table(toc_data, colWidths=[20, 145, 165, CONTENT_WIDTH - 330])
    toc_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), DARK_CARD),
        ('PADDING', (0, 0), (-1, -1), 2.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [ROW_BG_LIGHT, ROW_BG_ALT]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(toc_table)
    story.append(PageBreak())

    # =========================================================================
    # 2. SCREEN-BY-SCREEN DETAILS (1 PAGE PER SCREEN)
    # =========================================================================
    for num, title, route, img_path, desc, comps, arch in teacher_screens:
        screen_elements = []
        
        # Header banner for screen
        header_table = Table([
            [
                Paragraph(f"SCREEN {num} &nbsp;•&nbsp; TEACHER & ADMIN FLOW", styles["ScreenNumberTeacher"]),
                Paragraph(f"Route: {route}", styles["RouteTag"])
            ],
            [
                Paragraph(title, styles["ScreenTitle"]),
                Paragraph("", styles["TableCell"])
            ]
        ], colWidths=[CONTENT_WIDTH * 0.62, CONTENT_WIDTH * 0.38])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
            ('PADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 1), (-1, 1), 3),
        ]))
        screen_elements.append(header_table)
        screen_elements.append(HRFlowable(width="100%", thickness=1, color=PRIMARY_DARK_GOLD, spaceAfter=5, spaceBefore=1))

        # High-resolution Screenshot Image
        if os.path.exists(img_path):
            img = RLImage(img_path, width=CONTENT_WIDTH, height=270)
            screen_elements.append(img)
            screen_elements.append(Spacer(1, 5))
        else:
            screen_elements.append(Paragraph(f"[Screenshot image pending: {img_path}]", styles["BodyTextMuted"]))
            screen_elements.append(Spacer(1, 5))

        # Structured Details Table: What it is, Key Components, Architecture
        details_data = [
            [
                Paragraph("<b>Screen & Flow Purpose:</b>", styles["Label"]),
                Paragraph(desc, styles["BodyTextCustom"])
            ],
            [
                Paragraph("<b>UI Components & Elements:</b>", styles["Label"]),
                Paragraph(comps, styles["BodyTextCustom"])
            ],
            [
                Paragraph("<b>Data & Architectural Layer:</b>", styles["Label"]),
                Paragraph(arch, styles["BodyTextCustom"])
            ]
        ]
        details_table = Table(details_data, colWidths=[125, CONTENT_WIDTH - 125])
        details_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor("#F1F5F9")),
            ('BACKGROUND', (1, 0), (1, 0), colors.HexColor("#FAFAFA")),
            ('BACKGROUND', (1, 1), (1, 1), colors.HexColor("#FDF2F8")),
            ('BACKGROUND', (1, 2), (1, 2), colors.HexColor("#FAF5FF")),
            ('PADDING', (0, 0), (-1, -1), 3.5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        screen_elements.append(details_table)
        
        story.append(KeepTogether(screen_elements))
        story.append(PageBreak())

    # =========================================================================
    # 3. TEACHER ARCHITECTURE SYNTHESIS & WORKFLOW SUMMARY
    # =========================================================================
    story.append(Paragraph("Teacher & Studio Operations Architecture Summary", styles["SectionHeading"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY_DARK_GOLD, spaceAfter=8, spaceBefore=2))

    summary_blocks = [
        ("1. High-Touch Live Coaching with Zero Administrative Friction",
         "The live lesson workspace eliminates manual administrative overhead during singing sessions. Instructors can launch sessions in 1 click, type collaborative notes in real time using TipTap, attach audio recordings directly to exercise blocks, and trigger instant AI summarization to dispatch structured practice assignments to students."),
        
        ("2. Comprehensive Practice Telemetry & Student Diagnostics",
         "Rather than relying on subjective recall, coaches have immediate visibility into student practice fidelity between lessons. The 'My Students' CRM displays daily practice streaks, pitch onset speed trends, intonation accuracy %, and sharp/flat tendencies so teachers can immediately target problem areas."),
        
        ("3. Integrated SendGrid Studio CRM & Automated Marketing Funnels",
         "The platform integrates native email capabilities directly into the coaching interface. Instructors communicate with students via verified studio domains, schedule automated nurture sequences for prospective vocalists, and manage rich email templates without needing third-party email tools."),
        
        ("4. Scalable Masterclass Curriculum Engine & RBAC Administration",
         "Instructors author and publish structured multi-week masterclasses with video lessons, exercise checklists, and interactive quizzes. Administrators maintain organization-wide governance with master student rosters, verified email domains, and comprehensive studio telemetry.")
    ]

    for title, text in summary_blocks:
        card = Table([
            [Paragraph(f"<b>{title}</b>", ParagraphStyle("SumHT", parent=styles["SubSectionHeading"], textColor=colors.HexColor("#78350F")))],
            [Paragraph(text, styles["BodyTextCustom"])]
        ], colWidths=[CONTENT_WIDTH])
        card.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#FEF3C7")),
            ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor("#FFFBEB")),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#FDE68A")),
            ('PADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(card)
        story.append(Spacer(1, 6))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Teacher Flow PDF generated successfully: {output_path} ({os.path.getsize(output_path):,} bytes)", flush=True)


if __name__ == "__main__":
    student_pdf_1 = os.path.abspath("student_flow.pdf")
    teacher_pdf_1 = os.path.abspath("teacher_flow.pdf")
    student_pdf_2 = os.path.abspath("voice_alchemy_user_flow.pdf")
    teacher_pdf_2 = os.path.abspath("voice_alchemy_teacher_flow.pdf")
    
    generate_student_pdf(student_pdf_1)
    generate_teacher_pdf(teacher_pdf_1)
    generate_student_pdf(student_pdf_2)
    generate_teacher_pdf(teacher_pdf_2)
    
    print("\n==========================================")
    print("ALL PRODUCTION FLOW PDFs GENERATED!")
    print(f"1. Student Flow PDF: {student_pdf_1} ({os.path.getsize(student_pdf_1):,} bytes)")
    print(f"2. Teacher Flow PDF: {teacher_pdf_1} ({os.path.getsize(teacher_pdf_1):,} bytes)")
    print(f"3. User Flow PDF:    {student_pdf_2} ({os.path.getsize(student_pdf_2):,} bytes)")
    print(f"4. Teacher Flow PDF: {teacher_pdf_2} ({os.path.getsize(teacher_pdf_2):,} bytes)")
    print("==========================================")
