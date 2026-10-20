import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Forgot, Login, Register, Reset, Verify } from './pages/AuthPages.jsx';
import Privacy from './pages/Privacy.jsx';

function Home() {
  return (
    <section className="welcome">
      <h1>Hola, soy NOVA</h1>
      <p>Resuelvo preguntas sobre la normativa tributaria vigente en Colombia, citando la norma de donde sale cada respuesta.</p>
    </section>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
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
