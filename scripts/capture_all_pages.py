import asyncio
import os
import json
import urllib.request
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:3002"
STUDENT_EMAIL = "devin.patrick.fox@gmail.com"
TEACHER_EMAIL = "voicealchemyacademy@gmail.com"
JULIA_TEACHER_ID = "afb58109-3431-4d59-afc8-34e08a62bb00"
STUDENT_ID = "cff92333-72be-4d3d-9047-1b70343a4593"
SONG_ID = "1306d4cb-2bc0-4972-ad06-23d6a968e8d7"
EMAIL_THREAD_ID = "79a41e6d-f016-4c15-b420-008b47955bd2"

STUDENT_DIR = os.path.abspath("screenshots/student_flow")
TEACHER_DIR = os.path.abspath("screenshots/teacher_flow")
os.makedirs(STUDENT_DIR, exist_ok=True)
os.makedirs(TEACHER_DIR, exist_ok=True)

def get_dev_creds(email):
    req = urllib.request.Request(
        f"{BASE_URL}/api/dev/login-as",
        data=json.dumps({"email": email}).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    resp = json.loads(urllib.request.urlopen(req).read().decode("utf-8"))
    return resp

INIT_SCRIPT = """
    const tourKeys = [
        "teacher_dashboard_v4", "student_dashboard_v4", "teacher_course_builder_v4",
        "teacher_roster_v4", "training_center_v4", "pitch_trainer_v4",
        "rhythm_trainer_v4", "scale_trainer_v4", "classroom_v4", "song_trainer_v4"
    ];
    tourKeys.forEach(k => {
        localStorage.setItem(`vaaa_spotlight_v4_${k}`, "completed");
    });
"""

async def login_user(page, email):
    creds = get_dev_creds(email)
    print(f"Logging in as {email}...", flush=True)
    await page.goto(f"{BASE_URL}/login")
    await page.wait_for_selector("#email", timeout=10000)
    await page.fill("#email", creds["email"])
    await page.fill("#password", creds["password"])
    await page.click('button[type="submit"]')
    await page.wait_for_url("**/dashboard**", timeout=15000)
    await page.wait_for_timeout(2000)
    print(f"Successfully logged in as {email}", flush=True)

async def capture_student_flow(browser):
    print("\n==========================================", flush=True)
    print("STARTING STUDENT / USER FLOW CAPTURE", flush=True)
    print("==========================================", flush=True)
    
    context = await browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=2
    )
    await context.add_init_script(INIT_SCRIPT)
    page = await context.new_page()

    # 1. Homepage / Landing Gateway
    print("[1/22] Capturing 01_homepage.png...", flush=True)
    await page.goto(f"{BASE_URL}/")
    await page.wait_for_timeout(2000)
    await page.screenshot(path=f"{STUDENT_DIR}/01_homepage.png", full_page=False)

    # 2. Login Page
    print("[2/22] Capturing 02_login_page.png...", flush=True)
    await page.goto(f"{BASE_URL}/login")
    await page.wait_for_timeout(1500)
    await page.screenshot(path=f"{STUDENT_DIR}/02_login_page.png", full_page=False)

    # 3. Signup Student Page
    print("[3/22] Capturing 03_signup_student.png...", flush=True)
    await page.goto(f"{BASE_URL}/signup?role=student")
    await page.wait_for_timeout(1500)
    await page.screenshot(path=f"{STUDENT_DIR}/03_signup_student.png", full_page=False)

    # 4. Signup Teacher Page
    print("[4/22] Capturing 04_signup_teacher.png...", flush=True)
    await page.goto(f"{BASE_URL}/signup?role=teacher")
    await page.wait_for_timeout(1500)
    await page.screenshot(path=f"{STUDENT_DIR}/04_signup_teacher.png", full_page=False)

    # 5. Forgot Password Page
    print("[5/22] Capturing 05_forgot_password.png...", flush=True)
    await page.goto(f"{BASE_URL}/forgot-password")
    await page.wait_for_timeout(1500)
    await page.screenshot(path=f"{STUDENT_DIR}/05_forgot_password.png", full_page=False)

    # 6. Reset Password Page
    print("[6/22] Capturing 06_reset_password.png...", flush=True)
    await page.goto(f"{BASE_URL}/reset-password")
    await page.wait_for_timeout(1500)
    await page.screenshot(path=f"{STUDENT_DIR}/06_reset_password.png", full_page=False)

    # Login as Student
    await login_user(page, STUDENT_EMAIL)

    # 7. Student Dashboard
    print("[7/22] Capturing 07_student_dashboard.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{STUDENT_DIR}/07_student_dashboard.png", full_page=False)

    # 8. Student My Lessons
    print("[8/22] Capturing 08_student_my_lessons.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/my-lessons")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{STUDENT_DIR}/08_student_my_lessons.png", full_page=False)

    # 9. Student Lesson Notes Detail
    print("[9/22] Capturing 09_student_lesson_notes_detail.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/my-lessons/{JULIA_TEACHER_ID}")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{STUDENT_DIR}/09_student_lesson_notes_detail.png", full_page=False)

    # 10. Student Courses Catalog
    print("[10/22] Capturing 10_student_courses_catalog.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/courses")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{STUDENT_DIR}/10_student_courses_catalog.png", full_page=False)

    # 11. Student Course Walkthrough Overview
    print("[11/22] Capturing 11_student_course_walkthrough_overview.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/courses/beginner-vocal-foundations")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{STUDENT_DIR}/11_student_course_walkthrough_overview.png", full_page=False)

    # 12. Student Course Walkthrough Lesson
    print("[12/22] Capturing 12_student_course_walkthrough_lesson.png...", flush=True)
    try:
        sovt_btn = page.locator("button:has-text('SOVT')").first
        if await sovt_btn.is_visible():
            await sovt_btn.click()
            await page.wait_for_timeout(1000)
    except Exception as e:
        print("Course toggle note:", e)
    await page.screenshot(path=f"{STUDENT_DIR}/12_student_course_walkthrough_lesson.png", full_page=False)

    # 13. Student Training Center - Overview Tab
    print("[13/22] Capturing 13_student_training_center_overview.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/training-center")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{STUDENT_DIR}/13_student_training_center_overview.png", full_page=False)

    # 14. Student Training Center - Pitch Trainer Tab
    print("[14/22] Capturing 14_student_training_center_pitch_trainer.png...", flush=True)
    try:
        await page.click("button:has-text('Pitch Trainer')")
        await page.wait_for_timeout(2000)
    except Exception as e:
        print("Pitch tab error:", e)
    await page.screenshot(path=f"{STUDENT_DIR}/14_student_training_center_pitch_trainer.png", full_page=False)

    # 15. Student Training Center - Rhythm Trainer Tab
    print("[15/22] Capturing 15_student_training_center_rhythm_trainer.png...", flush=True)
    try:
        await page.click("button:has-text('Rhythm Trainer')")
        await page.wait_for_timeout(2000)
    except Exception as e:
        print("Rhythm tab error:", e)
    await page.screenshot(path=f"{STUDENT_DIR}/15_student_training_center_rhythm_trainer.png", full_page=False)

    # 16. Student Training Center - Scales Tab
    print("[16/22] Capturing 16_student_training_center_scales.png...", flush=True)
    try:
        await page.click("button:has-text('Scales')")
        await page.wait_for_timeout(2000)
    except Exception as e:
        print("Scales tab error:", e)
    await page.screenshot(path=f"{STUDENT_DIR}/16_student_training_center_scales.png", full_page=False)

    # 17. Student Training Center - AI Coach Analysis Modal
    print("[17/22] Capturing 17_student_training_center_ai_panel.png...", flush=True)
    try:
        analyze_btn = page.locator("button:has-text('Analyze Notes')").first
        if await analyze_btn.is_visible():
            await analyze_btn.click()
            await page.wait_for_timeout(2000)
            await page.screenshot(path=f"{STUDENT_DIR}/17_student_training_center_ai_panel.png", full_page=False)
            close_btn = page.locator("button:has-text('Close'), button svg.lucide-x").first
            if await close_btn.is_visible():
                await close_btn.click()
                await page.wait_for_timeout(500)
    except Exception as e:
        print("AI Panel error:", e)

    # 18. Student Songwriting Hub
    print("[18/22] Capturing 18_student_songwriting_list.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/songwriting")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{STUDENT_DIR}/18_student_songwriting_list.png", full_page=False)

    # 19. Student Songwriting Editor
    print("[19/22] Capturing 19_student_songwriting_editor.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/songwriting/{SONG_ID}")
    await page.wait_for_timeout(3500)
    await page.screenshot(path=f"{STUDENT_DIR}/19_student_songwriting_editor.png", full_page=False)

    # 20. Student Find Teacher Directory
    print("[20/22] Capturing 20_student_find_teacher.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/find-teacher")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{STUDENT_DIR}/20_student_find_teacher.png", full_page=False)

    # 21. Student Calendar
    print("[21/22] Capturing 21_student_calendar.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/calendar")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{STUDENT_DIR}/21_student_calendar.png", full_page=False)

    # 22. Student Settings
    print("[22/22] Capturing 22_student_settings.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/settings")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{STUDENT_DIR}/22_student_settings.png", full_page=False)

    await context.close()
    print("Student flow screenshots captured successfully!", flush=True)

async def capture_teacher_flow(browser):
    print("\n==========================================", flush=True)
    print("STARTING TEACHER / ADMIN FLOW CAPTURE", flush=True)
    print("==========================================", flush=True)
    
    context = await browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=2
    )
    await context.add_init_script(INIT_SCRIPT)
    page = await context.new_page()

    # 1. Teacher Login View
    print("[1/22] Capturing 01_teacher_login.png...", flush=True)
    await page.goto(f"{BASE_URL}/login")
    await page.wait_for_timeout(1500)
    await page.screenshot(path=f"{TEACHER_DIR}/01_teacher_login.png", full_page=False)

    # Login as Teacher (Julia)
    await login_user(page, TEACHER_EMAIL)

    # 2. Teacher Dashboard
    print("[2/22] Capturing 02_teacher_dashboard.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{TEACHER_DIR}/02_teacher_dashboard.png", full_page=False)

    # 3. Teacher My Students Directory
    print("[3/22] Capturing 03_teacher_my_students.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/students")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{TEACHER_DIR}/03_teacher_my_students.png", full_page=False)

    # 4. Teacher Inbound Student Requests
    print("[4/22] Capturing 04_teacher_student_requests.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/students/requests")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{TEACHER_DIR}/04_teacher_student_requests.png", full_page=False)

    # 5. Teacher Student Detail / Profile & Progress
    print("[5/22] Capturing 05_teacher_student_detail_profile.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/students/{STUDENT_ID}")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{TEACHER_DIR}/05_teacher_student_detail_profile.png", full_page=False)

    # 6. Teacher Live Class & Lesson Notes Workspace
    print("[6/22] Capturing 06_teacher_live_class_notes_workspace.png...", flush=True)
    try:
        start_btn = page.locator("button:has-text('Start Class'), button:has-text('Resume Class')").first
        if await start_btn.is_visible():
            await start_btn.click()
            await page.wait_for_timeout(1500)
    except Exception as e:
        print("Note workspace action:", e)
    await page.screenshot(path=f"{TEACHER_DIR}/06_teacher_live_class_notes_workspace.png", full_page=False)

    # 7. Teacher Courses Management
    print("[7/22] Capturing 07_teacher_courses_management.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/courses")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{TEACHER_DIR}/07_teacher_courses_management.png", full_page=False)

    # 8. Teacher Course Curriculum / Lesson Structure
    print("[8/22] Capturing 08_teacher_course_curriculum_editor.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/courses/beginner-vocal-foundations")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{TEACHER_DIR}/08_teacher_course_curriculum_editor.png", full_page=False)

    # 9. Teacher Email CRM - Inbox
    print("[9/22] Capturing 09_teacher_email_inbox.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/email")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{TEACHER_DIR}/09_teacher_email_inbox.png", full_page=False)

    # 10. Teacher Email - Compose
    print("[10/22] Capturing 10_teacher_email_compose.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/email/compose")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{TEACHER_DIR}/10_teacher_email_compose.png", full_page=False)

    # 11. Teacher Email - Sent
    print("[11/22] Capturing 11_teacher_email_sent.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/email/sent")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{TEACHER_DIR}/11_teacher_email_sent.png", full_page=False)

    # 12. Teacher Email - Drafts
    print("[12/22] Capturing 12_teacher_email_drafts.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/email/drafts")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{TEACHER_DIR}/12_teacher_email_drafts.png", full_page=False)

    # 13. Teacher Email - Starred
    print("[13/22] Capturing 13_teacher_email_starred.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/email/starred")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{TEACHER_DIR}/13_teacher_email_starred.png", full_page=False)

    # 14. Teacher Email - Thread Detail
    print("[14/22] Capturing 14_teacher_email_thread_detail.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/email/{EMAIL_THREAD_ID}")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{TEACHER_DIR}/14_teacher_email_thread_detail.png", full_page=False)

    # 15. Teacher Email Templates
    print("[15/22] Capturing 15_teacher_email_templates.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/email-templates?tab=templates")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{TEACHER_DIR}/15_teacher_email_templates.png", full_page=False)

    # 16. Teacher Email Funnels
    print("[16/22] Capturing 16_teacher_email_funnels.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/email-templates?tab=funnels")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{TEACHER_DIR}/16_teacher_email_funnels.png", full_page=False)

    # 17. Teacher Calendar & Schedule Manager
    print("[17/22] Capturing 17_teacher_calendar_schedule.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/calendar")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{TEACHER_DIR}/17_teacher_calendar_schedule.png", full_page=False)

    # 18. Teacher Training Center
    print("[18/22] Capturing 18_teacher_training_center_analytics.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/training-center")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{TEACHER_DIR}/18_teacher_training_center_analytics.png", full_page=False)

    # 19. Teacher Settings
    print("[19/22] Capturing 19_teacher_settings.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/settings")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{TEACHER_DIR}/19_teacher_settings.png", full_page=False)

    # 20. Admin Student Directory
    print("[20/22] Capturing 20_admin_student_directory.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/admin/students")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f"{TEACHER_DIR}/20_admin_student_directory.png", full_page=False)

    # 21. Email Domains Settings
    print("[21/22] Capturing 21_teacher_email_settings_domains.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/email/settings/domains")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{TEACHER_DIR}/21_teacher_email_settings_domains.png", full_page=False)

    # 22. Email Accounts Settings
    print("[22/22] Capturing 22_teacher_email_settings_accounts.png...", flush=True)
    await page.goto(f"{BASE_URL}/dashboard/email/settings/accounts")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{TEACHER_DIR}/22_teacher_email_settings_accounts.png", full_page=False)

    await context.close()
    print("Teacher flow screenshots captured successfully!", flush=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        await capture_student_flow(browser)
        await capture_teacher_flow(browser)
        await browser.close()
    print("\nALL SCREENSHOTS SUCCESSFULLY CAPTURED!", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
