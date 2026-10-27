
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS maps_url text;

COMMENT ON COLUMN public.venues.maps_url IS
'Owner-provided Google Maps share URL for the venue';
