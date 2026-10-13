-- ==============================================================================
-- CodiReactor — Supabase Database Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- ==============================================================================

-- 1. Profiles Table (User settings, CEFR level, target & native languages)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  target_language TEXT DEFAULT 'en',
  native_language TEXT DEFAULT 'ar',
  cefr_level TEXT DEFAULT 'B1', -- A1, A2, B1, B2, C1, C2
  known_words_count INTEGER DEFAULT 0,
  learning_words_count INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{
    "autoPause": false,
    "showSubtitleOverlay": true,
    "showTranscriptPanel": true,
    "speakOnClick": "yes"
  }'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 2. Saved Vocabulary & Phrases (Words, translations, context sentence, SRS metrics)
CREATE TABLE IF NOT EXISTS public.saved_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  clean_word TEXT NOT NULL,
  lemma TEXT,
  translation TEXT,
  phonetic TEXT,
  pos TEXT,
  sentence_target TEXT, -- Sentence in target language (L2)
  sentence_native TEXT, -- Translated sentence in native language (L1)
  source_platform TEXT DEFAULT 'youtube', -- 'youtube', 'netflix', 'udemy', 'coursera', 'webreader'
  source_url TEXT,
  source_title TEXT,
  timestamp_ms BIGINT DEFAULT 0,
  color_tag TEXT DEFAULT 'default',
  status TEXT DEFAULT 'learning', -- 'learning', 'known', 'ignored'
  
  -- SM-2 Spaced Repetition (SRS)
  srs_interval INTEGER DEFAULT 0,
  srs_repetitions INTEGER DEFAULT 0,
  srs_ease_factor NUMERIC(4, 2) DEFAULT 2.50,
  srs_due_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_vocab_user ON public.saved_vocabulary(user_id);
CREATE INDEX IF NOT EXISTS idx_vocab_status ON public.saved_vocabulary(user_id, status);
CREATE INDEX IF NOT EXISTS idx_vocab_due ON public.saved_vocabulary(user_id, srs_due_date);
CREATE INDEX IF NOT EXISTS idx_vocab_word ON public.saved_vocabulary(user_id, clean_word);

-- Enable RLS for Vocabulary
ALTER TABLE public.saved_vocabulary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own vocabulary"
  ON public.saved_vocabulary FOR ALL
  USING (auth.uid() = user_id);

-- 3. SRS Review History Log (Track review activity for heatmaps & streak metrics)
CREATE TABLE IF NOT EXISTS public.srs_reviews_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocab_id UUID NOT NULL REFERENCES public.saved_vocabulary(id) ON DELETE CASCADE,
  quality INTEGER NOT NULL, -- 0 to 5 (SM-2 rating)
  previous_interval INTEGER DEFAULT 0,
  new_interval INTEGER DEFAULT 0,
  reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_user ON public.srs_reviews_log(user_id, reviewed_at);

-- Enable RLS for Reviews
ALTER TABLE public.srs_reviews_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and insert their own review logs"
  ON public.srs_reviews_log FOR ALL
  USING (auth.uid() = user_id);

-- 4. Automatic Trigger to create Profile on User Sign Up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
