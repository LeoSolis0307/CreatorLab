module.exports = async (_req, res) => {
  res.statusCode = 501;
  return res.json({
    ok: false,
    error: 'En Vercel no se puede guardar en /public/img. Si quieres subir imágenes en producción, hay que usar Vercel Blob u otro storage.'
  });
};
