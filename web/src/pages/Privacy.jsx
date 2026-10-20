// BORRADOR: debe reemplazarse por la política oficial de tratamiento de datos de la UDES
// revisada por su área jurídica antes de salir a producción.
export default function Privacy() {
  return (
    <article className="card prose page">
      <h1>Política de tratamiento de datos personales</h1>
      <p className="alert alert-warn">Borrador para desarrollo. Debe ser reemplazado por la política oficial de la Universidad de Santander (UDES).</p>
      <h2>Responsable</h2>
      <p>Universidad de Santander (UDES) – Consultorio Empresarial, en el marco del proyecto PROP-DET07-26.</p>
      <h2>Datos que recolectamos</h2>
      <ul>
        <li>Usuarios registrados: nombre, correo electrónico, contraseña (guardada cifrada) y el historial de consultas.</li>
        <li>Usuarios sin registro: no guardamos el historial de conversaciones; solo un contador temporal de uso asociado a la sesión.</li>
      </ul>
      <h2>Finalidad</h2>
      <p>Prestar el servicio de orientación sobre normativa tributaria, mantener el historial de consultas del usuario, controlar el uso de la plataforma y mejorar la calidad de las respuestas.</p>
      <h2>Uso de inteligencia artificial</h2>
      <p>
        Las respuestas son generadas por un modelo de inteligencia artificial a partir de normas oficiales. Son orientativas y no reemplazan la asesoría de un
        contador o abogado. No ingreses datos sensibles ni información personal de terceros en tus preguntas.
      </p>
      <h2>Tus derechos (Ley 1581 de 2012)</h2>
      <p>Puedes conocer, actualizar, rectificar y solicitar la supresión de tus datos, y revocar esta autorización, escribiendo a [correo de contacto por definir].</p>
    </article>
  );
}
