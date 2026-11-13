import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getToken, setToken } from "./api";
import { AuthPage, VkCallback } from "./pages/AuthPage";
import { CabinetPage } from "./pages/CabinetPage";
import { CatalogPage } from "./pages/CatalogPage";
import { OrderPage } from "./pages/OrderPage";
import { ProductPage } from "./pages/ProductPage";
import { StorefrontPage } from "./pages/StorefrontPage";
import { StorefrontsPage } from "./pages/StorefrontsPage";

function TabIcon({ name }: { name: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24">
        <path fill="currentColor" d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    );
  }
  if (name === "catalog") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" />
        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" />
      </svg>
    );
  }
  if (name === "orders") {
    return (
      <svg {...common}>
        <path d="M6.5 8h11l-.8 11H7.3L6.5 8Z" />
        <path d="M9 8V6.8A3 3 0 0 1 12 4a3 3 0 0 1 3 2.8V8" />
      </svg>
    );
  }
  if (name === "shop") {
    return (
      <svg {...common}>
        <path d="M4 10.5 6.2 5h11.6L20 10.5" />
        <path d="M4 10.5h16V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5Z" />
        <path d="M4 10.5c0 1.4 1.2 2.2 2.6 2.2S9.2 11.9 9.2 10.5c0 1.4 1.2 2.2 2.8 2.2s2.8-.8 2.8-2.2c0 1.4 1.2 2.2 2.6 2.2 1.4 0 2.6-.8 2.6-2.2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.2c1.3-3 3.6-4.4 6.5-4.4s5.2 1.4 6.5 4.4" />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const signedIn = Boolean(getToken());
  const home = location.pathname === "/";
  return (
    <div className="wrap">
      {home && (
        <div className="corner-auth">
          {signedIn ? (
            <button
              type="button"
              onClick={() => {
                setToken(null);
                navigate("/");
              }}
            >
              Выйти
            </button>
          ) : (
            <Link to="/login">Войти</Link>
          )}
        </div>
      )}
      {!home && (
        <header className="bar">
          <Link to="/">Поток</Link>
          <nav>
            {signedIn ? (
              <button
                className="ghost"
                onClick={() => {
                  setToken(null);
                  navigate("/");
                }}
              >
                Выйти
              </button>
            ) : (
              <Link to="/login">Войти</Link>
            )}
          </nav>
        </header>
      )}
      {children}
      <nav className="tabbar">
        <Link to="/" className="tab-brand">Поток</Link>
        <Link to="/" className={home ? "on" : ""}><TabIcon name="home" />Главная</Link>
        <Link to="/catalog" className={location.pathname === "/catalog" ? "on" : ""}><TabIcon name="catalog" />Каталог</Link>
        <Link to={signedIn ? "/my-orders" : "/login"} className={location.pathname === "/my-orders" ? "on" : ""}><TabIcon name="orders" />Мои заказы</Link>
        <Link to={signedIn ? "/cabinet" : "/login"} className={location.pathname === "/cabinet" ? "on" : ""}><TabIcon name="shop" />Моя витрина</Link>
        <Link to={signedIn ? "/cabinet" : "/login"}><TabIcon name="profile" />Профиль</Link>
      </nav>
    </div>
  );
}

function Private({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/login/vk" element={<VkCallback />} />
        <Route path="/auth/vk/callback" element={<VkCallback />} />
        <Route path="/auth/vk/callback/" element={<VkCallback />} />
        <Route path="/" element={<StorefrontsPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/storefronts/:id" element={<StorefrontPage />} />
        <Route path="/products/:id" element={<ProductPage />} />
        <Route path="/orders/:id" element={<Private><OrderPage /></Private>} />
        <Route path="/cabinet" element={<Private><CabinetPage /></Private>} />
        <Route path="/my-orders" element={<Private><p className="muted">Заявок пока нет. Откройте сбор и нажмите «Присоединиться».</p></Private>} />
      </Routes>
    </Shell>
  );
}
