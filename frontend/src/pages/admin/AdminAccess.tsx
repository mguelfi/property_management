import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  useAdminRoles,
  useAdminUsers,
  usePermissions,
  useRoleAdminActions,
  useUserAdminActions,
} from "../../api/hooks";
import type { AdminUser, Permission, Role } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toaster";
import {
  EmptyState,
  ErrorText,
  Field,
  Modal,
  Pagination,
  Spinner,
  Tabs,
  Textarea,
  TextInput,
} from "../../components/ui";

const PAGE = 20;

export function AdminAccess() {
  const { can } = useAuth();
  const [tab, setTab] = useState(can("auth.manage_users") ? "users" : "roles");
  const tabs: [string, string][] = [];
  if (can("auth.manage_users")) tabs.push(["users", "Users"]);
  if (can("auth.manage_roles")) tabs.push(["roles", "Roles"]);

  return (
    <>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "users" && can("auth.manage_users") && <UsersTab />}
      {tab === "roles" && can("auth.manage_roles") && <RolesTab />}
    </>
  );
}

// --------------------------------------------------------------------------- //
// Users
// --------------------------------------------------------------------------- //

function UsersTab() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);

  const users = useAdminUsers(q, page * PAGE, PAGE);
  const roles = useAdminRoles();
  const actions = useUserAdminActions();
  const pages = users.data ? Math.ceil(users.data.total / PAGE) : 0;

  return (
    <>
      <div className="page-head">
        <h2>Users</h2>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          New user
        </button>
      </div>

      <div className="card">
        <Field label="Search">
          <TextInput
            placeholder="Username, name or email"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </Field>
      </div>

      <div className="card">
        {users.isLoading && <Spinner />}
        <ErrorText error={users.error} />
        {users.data?.items.length === 0 && <EmptyState>No users.</EmptyState>}
        {users.data && users.data.items.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.full_name || "—"}</td>
                    <td>{u.email || "—"}</td>
                    <td>
                      {u.is_superuser ? (
                        <span className="badge badge-in_house">superuser</span>
                      ) : (
                        u.roles.map((r) => r.code).join(", ") || "—"
                      )}
                    </td>
                    <td>
                      {u.is_active ? (
                        "Active"
                      ) : (
                        <span className="badge badge-cancelled">Disabled</span>
                      )}
                    </td>
                    <td className="num-cell">
                      <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                        <button className="btn btn-sm" onClick={() => setEditing(u)}>
                          Edit
                        </button>
                        <button className="btn btn-sm" onClick={() => setResetting(u)}>
                          Reset password
                        </button>
                        {u.is_active && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              if (!window.confirm(`Deactivate ${u.username}?`)) return;
                              actions.deactivate.mutate(u.id, {
                                onSuccess: () => toast.ok("User deactivated"),
                                onError: toast.error,
                              });
                            }}
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} onPage={setPage} />
      </div>

      {creating && (
        <UserCreateModal
          roles={roles.data?.items ?? []}
          busy={actions.create.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(body) =>
            actions.create.mutate(body, {
              onSuccess: () => {
                toast.ok("User created");
                setCreating(false);
              },
              onError: toast.error,
            })
          }
        />
      )}

      {editing && (
        <UserEditModal
          user={editing}
          roles={roles.data?.items ?? []}
          busy={actions.update.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(body) =>
            actions.update.mutate(
              { id: editing.id, body },
              {
                onSuccess: () => {
                  toast.ok("Saved");
                  setEditing(null);
                },
                onError: toast.error,
              },
            )
          }
        />
      )}

      {resetting && (
        <ResetPasswordModal
          user={resetting}
          busy={actions.resetPassword.isPending}
          onClose={() => setResetting(null)}
          onSubmit={(password) =>
            actions.resetPassword.mutate(
              { id: resetting.id, password },
              {
                onSuccess: (res) => {
                  toast.ok(
                    res.password
                      ? `New password: ${res.password}`
                      : "Password updated",
                  );
                  setResetting(null);
                },
                onError: toast.error,
              },
            )
          }
        />
      )}
    </>
  );
}

function RolePicker({
  roles,
  selected,
  onToggle,
}: {
  roles: Role[];
  selected: Set<string>;
  onToggle: (code: string) => void;
}) {
  return (
    <Field
      label="Roles"
      help="Assign one or more roles. The user gets the combined permissions of every role selected."
    >
      <div className="perm-grid">
        {roles.map((r) => (
          <label key={r.id} className="perm-item">
            <input
              type="checkbox"
              checked={selected.has(r.code)}
              onChange={() => onToggle(r.code)}
            />
            {r.name}
          </label>
        ))}
      </div>
    </Field>
  );
}

function UserCreateModal({
  roles,
  busy,
  onClose,
  onSubmit,
}: {
  roles: Role[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({ username: "", password: "", full_name: "", email: "" });
  const [isSuper, setIsSuper] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (c: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      username: f.username,
      password: f.password,
      full_name: f.full_name,
      email: f.email || undefined,
      is_superuser: isSuper,
      role_codes: [...sel],
    });
  }

  return (
    <Modal title="New user" onClose={onClose}>
      <form onSubmit={submit}>
        <Field
          label="Username"
          help="The name this person signs in with. 3–50 characters: letters, digits, dot, dash, underscore. Cannot be changed here after creation."
        >
          <TextInput
            required
            value={f.username}
            onChange={(e) => setF({ ...f, username: e.target.value })}
          />
        </Field>
        <Field
          label="Password"
          hint="At least 8 characters"
          help="Initial password. The user cannot change it themselves yet — an admin resets it via 'Reset password'."
        >
          <TextInput
            type="password"
            required
            minLength={8}
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
          />
        </Field>
        <div className="form-row">
          <Field label="Full name">
            <TextInput
              value={f.full_name}
              onChange={(e) => setF({ ...f, full_name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </Field>
        </div>
        <label
          className="perm-item"
          title="A superuser bypasses all permission checks and can do anything in the system. Grant sparingly; prefer roles."
        >
          <input
            type="checkbox"
            checked={isSuper}
            onChange={(e) => setIsSuper(e.target.checked)}
          />
          Superuser (full access)
        </label>
        {!isSuper && <RolePicker roles={roles} selected={sel} onToggle={toggle} />}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create user"}
        </button>
      </form>
    </Modal>
  );
}

function UserEditModal({
  user,
  roles,
  busy,
  onClose,
  onSubmit,
}: {
  user: AdminUser;
  roles: Role[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email ?? "");
  const [active, setActive] = useState(user.is_active);
  const [isSuper, setIsSuper] = useState(user.is_superuser);
  const [sel, setSel] = useState<Set<string>>(
    new Set(user.roles.map((r) => r.code)),
  );
  const toggle = (c: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      full_name: fullName,
      email: email || null,
      is_active: active,
      is_superuser: isSuper,
      role_codes: [...sel],
    });
  }

  return (
    <Modal title={`Edit ${user.username}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Full name">
            <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <label
          className="perm-item"
          title="Inactive accounts cannot sign in. Deactivating is the way to 'remove' a user — the record and its history are kept."
        >
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active
        </label>
        <label
          className="perm-item"
          title="A superuser bypasses all permission checks and can do anything in the system. Grant sparingly; prefer roles."
        >
          <input
            type="checkbox"
            checked={isSuper}
            onChange={(e) => setIsSuper(e.target.checked)}
          />
          Superuser (full access)
        </label>
        {!isSuper && <RolePicker roles={roles} selected={sel} onToggle={toggle} />}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  busy,
  onClose,
  onSubmit,
}: {
  user: AdminUser;
  busy: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
}) {
  const [pw, setPw] = useState("");
  return (
    <Modal title={`Reset password — ${user.username}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(pw);
        }}
      >
        <Field
          label="New password"
          hint="Leave blank to generate a random one"
        >
          <TextInput
            type="text"
            minLength={8}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Working…" : "Reset password"}
        </button>
      </form>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// Roles
// --------------------------------------------------------------------------- //

function RolesTab() {
  const toast = useToast();
  const roles = useAdminRoles();
  const permissions = usePermissions();
  const actions = useRoleAdminActions();
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="page-head">
        <h2>Roles</h2>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          New role
        </button>
      </div>

      <div className="card">
        {roles.isLoading && <Spinner />}
        <ErrorText error={roles.error} />
        {roles.data && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Permissions</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {roles.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>{r.code}</td>
                    <td>{r.name}</td>
                    <td>{r.permissions.length}</td>
                    <td className="num-cell">
                      <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                        <button className="btn btn-sm" onClick={() => setEditing(r)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            if (!window.confirm(`Delete role ${r.code}?`)) return;
                            actions.remove.mutate(r.id, {
                              onSuccess: () => toast.ok("Role deleted"),
                              onError: toast.error,
                            });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <RoleModal
          role={editing}
          permissions={permissions.data ?? []}
          busy={actions.create.isPending || actions.update.isPending}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(body) => {
            const opts = {
              onSuccess: () => {
                toast.ok("Saved");
                setCreating(false);
                setEditing(null);
              },
              onError: toast.error,
            };
            if (editing) actions.update.mutate({ id: editing.id, body }, opts);
            else actions.create.mutate(body, opts);
          }}
        />
      )}
    </>
  );
}

function RoleModal({
  role,
  permissions,
  busy,
  onClose,
  onSubmit,
}: {
  role: Role | null;
  permissions: Permission[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [code, setCode] = useState(role?.code ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [sel, setSel] = useState<Set<string>>(
    new Set(role?.permissions.map((p) => p.code) ?? []),
  );

  useEffect(() => {
    setCode(role?.code ?? "");
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setSel(new Set(role?.permissions.map((p) => p.code) ?? []));
  }, [role]);

  const groups = useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of permissions) {
      const key = p.code.split(".")[0];
      const list = m.get(key) ?? [];
      list.push(p);
      m.set(key, list);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  const toggle = (c: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      code,
      name,
      description,
      permission_codes: [...sel],
    });
  }

  return (
    <Modal title={role ? `Edit ${role.code}` : "New role"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field
            label="Code"
            hint="lowercase, e.g. night_manager"
            help="Stable internal identifier for the role, used by seed scripts and integrations. Renaming it may break automation that references the old code."
          >
            <TextInput
              required
              pattern="[a-z][a-z0-9_]*"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Field label="Name" help="Human-readable role name shown when assigning roles to users.">
            <TextInput required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Field label="Description" help="Optional note on what this role is for and who should have it.">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field
          label="Permissions"
          help="Everything a user with this role can do. A user's effective permissions are the union of all their roles. Hover a permission for its meaning."
        >
          <div>
            {groups.map(([group, perms]) => (
              <div key={group} style={{ marginBottom: 8 }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                  {group}
                </div>
                <div className="perm-grid">
                  {perms.map((p) => (
                    <label key={p.code} className="perm-item" title={p.description}>
                      <input
                        type="checkbox"
                        checked={sel.has(p.code)}
                        onChange={() => toggle(p.code)}
                      />
                      {p.code}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save role"}
        </button>
      </form>
    </Modal>
  );
}
