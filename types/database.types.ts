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

// Course level
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';

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

export interface Course {
  id: string;
  title: string;
  description: string | null;
  instructor_id: string; // References profiles.id
  thumbnail_url: string | null;
  level: CourseLevel;
  is_published: boolean;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  instructor?: Profile;
}

export interface Module {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  order_index: number;
  created_at: string;
  // Joined data
  course?: Course;
  lessons?: Lesson[];
}

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  duration: number | null;
  keywords: string[] | null;
  watch_required: boolean;
  order_index: number;
  created_at: string;
  // Joined data
  module?: Module;
}

export interface CourseEnrollment {
  id: string;
  student_id: string;
  course_id: string;
  enrolled_at: string;
  // Joined data
  student?: Profile;
  course?: Course;
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
        Row: Course;
        Insert: Partial<Course> & Pick<Course, 'title' | 'instructor_id'>;
        Update: Partial<Course>;
        Relationships: [];
      };
      modules: {
        Row: Module;
        Insert: Partial<Module> & Pick<Module, 'course_id' | 'title'>;
        Update: Partial<Module>;
        Relationships: [];
      };
      lessons: {
        Row: Lesson;
        Insert: Partial<Lesson> & Pick<Lesson, 'module_id' | 'title'>;
        Update: Partial<Lesson>;
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
    Views: {};
    Functions: {};
    Enums: {
      profile_role: ProfileRole;
      booking_status: BookingStatus;
      course_level: CourseLevel;
    };
  };
}
