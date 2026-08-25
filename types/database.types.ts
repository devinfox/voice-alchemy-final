/**
 * Voice Alchemy Academy - Database Types
 * Matches existing Supabase schema
 */

// ============================================================================
// ENUMS
// ============================================================================

// Profile role - matches existing profiles.role values
export type ProfileRole = 'student' | 'teacher' | 'instructor' | 'admin';

// Booking status
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

// Course level — matches the DB default ('Beginner') and the values the
// course builder writes ('Beginner' | 'Intermediate' | 'Advanced').
export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'All Levels';

// ============================================================================
// TABLE TYPES
// ============================================================================

export interface Profile {
  id: string; // UUID, matches auth.users.id
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  role: ProfileRole | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
}

// Matches the courses table as built by 00006_safe_courses.sql plus the
// columns added in 20260730000001_teacher_courses_system.sql. Curriculum is
// a JSONB column of sections/lessons — there are no modules/lessons tables.
export interface DbCourse {
  id: string;
  name: string;
  title: string | null;
  slug: string | null;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  instructor_id: string | null; // References profiles.id (ON DELETE SET NULL)
  instructor_name: string | null;
  thumbnail_url: string | null;
  preview_video_url: string | null;
  level: CourseLevel | null;
  is_published: boolean;
  is_active: boolean;
  is_free: boolean;
  price: number | null;
  what_you_will_learn: string[];
  requirements: string[];
  curriculum: unknown; // JSONB array of sections/lessons (CourseSection[] shape)
  estimated_duration: string | null;
  max_students: number | null;
  created_at: string;
  updated_at: string;
  // Joined data
  instructor?: Profile;
}

export interface CourseEnrollment {
  id: string;
  student_id: string;
  course_id: string;
  status: string;
  enrolled_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  student?: Profile;
  course?: DbCourse;
}

export interface Booking {
  id: string;
  student_id: string;
  instructor_id: string;
  status: BookingStatus;
  // Video room info (we'll add these if they don't exist)
  daily_room_name?: string | null;
  daily_room_url?: string | null;
  // Schedule info
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  created_at: string;
  updated_at: string;
  // Joined data
  student?: Profile;
  instructor?: Profile;
}

export interface SessionNote {
  id?: string;
  booking_id: string;
  content: string;
  // For collaborative editing
  yjs_state?: string | null;
  week_start?: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  booking?: Booking;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  // Joined data
  sender?: Profile;
  recipient?: Profile;
}

export interface Note {
  id?: string;
  content: string;
  user_id?: string;
  lesson_id?: string;
  created_at?: string;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

// User type alias for compatibility
export type User = Profile;

// Platform role alias
export type PlatformRole = ProfileRole;

// ============================================================================
// DATABASE TYPE (for Supabase client)
// ============================================================================

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, 'id'>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      courses: {
        Row: DbCourse;
        Insert: Partial<DbCourse> & Pick<DbCourse, 'name'>;
        Update: Partial<DbCourse>;
        Relationships: [];
      };
      course_enrollments: {
        Row: CourseEnrollment;
        Insert: Partial<CourseEnrollment> & Pick<CourseEnrollment, 'student_id' | 'course_id'>;
        Update: Partial<CourseEnrollment>;
        Relationships: [];
      };
      bookings: {
        Row: Booking;
        Insert: Partial<Booking> & Pick<Booking, 'student_id' | 'instructor_id'>;
        Update: Partial<Booking>;
        Relationships: [];
      };
      session_notes: {
        Row: SessionNote;
        Insert: Partial<SessionNote> & Pick<SessionNote, 'booking_id' | 'content'>;
        Update: Partial<SessionNote>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: Partial<Message> & Pick<Message, 'sender_id' | 'recipient_id' | 'content'>;
        Update: Partial<Message>;
        Relationships: [];
      };
      notes: {
        Row: Note;
        Insert: Partial<Note> & Pick<Note, 'content'>;
        Update: Partial<Note>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      profile_role: ProfileRole;
      booking_status: BookingStatus;
      course_level: CourseLevel;
    };
  };
}

// ============================================================================
// EMAIL TEMPLATE / FUNNEL TYPES (ported from CRM)
// ============================================================================

export type EmailTemplateCategory =
  | 'welcome'
  | 'follow_up'
  | 'paperwork'
  | 'funding'
  | 'closing'
  | 'general'
  | 'lesson'
  | 'onboarding';

export type FunnelStatus = 'draft' | 'active' | 'paused' | 'archived'

export type EnrollmentStatus =
  | 'active'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'pending_approval'
  | 'rejected'

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  body_html: string | null
  description: string | null
  category: EmailTemplateCategory | null
  is_active: boolean
  created_by: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface EmailFunnel {
  id: string
  name: string
  description: string | null
  status: FunnelStatus
  tags: string[]
  auto_enroll_enabled: boolean
  total_enrolled: number
  total_completed: number
  total_emails_sent: number
  total_opens: number
  total_clicks: number
  created_by: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
  phases?: EmailFunnelPhase[]
  enrollments_count?: number
}

export interface EmailFunnelPhase {
  id: string
  funnel_id: string
  template_id: string | null
  phase_order: number
  name: string | null
  delay_days: number
  delay_hours: number
  emails_sent: number
  emails_opened: number
  emails_clicked: number
  created_at: string
  updated_at: string
  template?: EmailTemplate
}

export interface EmailFunnelEnrollment {
  id: string
  funnel_id: string
  lead_id: string | null
  contact_id: string | null
  status: EnrollmentStatus
  current_phase: number
  enrolled_at: string
  enrolled_by: string | null
  last_email_sent_at: string | null
  next_email_scheduled_at: string | null
  completed_at: string | null
  paused_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  match_reason: string | null
  created_at: string
  updated_at: string
  funnel?: EmailFunnel
}

export interface EmailFunnelLog {
  id: string
  enrollment_id: string
  phase_id: string
  email_id: string | null
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  bounced_at: string | null
  scheduled_for: string | null
  status: string
  error_message: string | null
  created_at: string
}
