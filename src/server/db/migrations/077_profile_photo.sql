-- A profile's own picture: a small image (data URL) the person uploads; without one, their initial on a colour.
ALTER TABLE profiles ADD COLUMN avatar_photo TEXT;
