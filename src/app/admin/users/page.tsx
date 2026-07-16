"use client";
import { useEffect, useState, useCallback } from "react";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: "internal" | "client";
  is_admin: boolean;
  advertiser_id: string | null;
  advertiser_name: string | null;
  created_at: string;
}
interface AdvertiserOption {
  advertiser_id: string;
  advertiser_name: string;
}

export default function AdminUsersPage() {
  const { profile, loading: profileLoading } = useProfile();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [advertisers, setAdvertisers] = useState<AdvertiserOption[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"internal" | "client">("client");
  const [advertiserId, setAdvertiserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const data = await res.json();
    if (res.ok) setUsers(data.users);
  }, []);

  useEffect(() => {
    if (profile?.role !== "internal" || !profile.is_admin) return;
    loadUsers();
    fetch("/api/clients", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAdvertisers(d.advertisers ?? []));
  }, [profile, loadUsers]);

  async function registerUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          role,
          display_name: displayName || undefined,
          advertiser_id: role === "client" ? advertiserId : undefined,
          is_admin: role === "internal" ? isAdmin : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Invited ${email}`);
      setOpen(false);
      setEmail("");
      setDisplayName("");
      setAdvertiserId("");
      setIsAdmin(false);
      await loadUsers();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (profileLoading) return <Skeleton className="h-64 w-full" />;

  if (profile?.role !== "internal" || !profile.is_admin) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Internal admins only.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team &amp; clients</h1>
          <p className="text-sm text-muted-foreground">
            Every account is registered here — there&apos;s no public sign-up.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="mr-1.5 h-3.5 w-3.5" /> Register user</Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={registerUser}>
              <DialogHeader>
                <DialogTitle>Register a new user</DialogTitle>
                <DialogDescription>
                  They&apos;ll receive a magic-link email to sign in — no password to set.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input id="reg-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-name">Display name (optional)</Label>
                  <Input id="reg-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Account type</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as "internal" | "client")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client (brand lead / operator at one advertiser)</SelectItem>
                      <SelectItem value="internal">Internal (DynaMo team)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {role === "client" && (
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Select value={advertiserId} onValueChange={setAdvertiserId}>
                      <SelectTrigger><SelectValue placeholder="Select a client…" /></SelectTrigger>
                      <SelectContent>
                        {advertisers.map((a) => (
                          <SelectItem key={a.advertiser_id} value={a.advertiser_id}>{a.advertiser_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {role === "internal" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
                    Grant admin (can register other users)
                  </label>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy || (role === "client" && !advertiserId)}>
                  {busy ? "Sending invite…" : "Send invite"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!users ? (
              <TableRow><TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
            ) : users.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No users yet.</TableCell></TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.display_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {u.role === "internal" ? (u.is_admin ? "Internal · Admin" : "Internal") : "Client"}
                    </Badge>
                  </TableCell>
                  <TableCell>{u.advertiser_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
