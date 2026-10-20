import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Forgot, Login, Register, Reset, Verify } from './pages/AuthPages.jsx';
import Privacy from './pages/Privacy.jsx';
import Chat from './pages/Chat.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Chat />} />
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Register />} />
            <Route path="/verificar" element={<Verify />} />
            <Route path="/recuperar" element={<Forgot />} />
            <Route path="/restablecer" element={<Reset />} />
            <Route path="/privacidad" element={<Privacy />} />
            <Route path="*" element={<p className="welcome">Página no encontrada.</p>} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}
