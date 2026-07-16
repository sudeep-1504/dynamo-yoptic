"use client";
import { useEffect, useState } from "react";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: "internal" | "client";
  is_admin: boolean;
  advertiser_id: string | null;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.reason || data.error || "failed to load profile");
        } else {
          setProfile(data.profile);
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return { profile, loading, error };
}
