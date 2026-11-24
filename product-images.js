(() => {
  const bucketName = "product-images";
  const maxFileSize = 10 * 1024 * 1024;
  const maxImages = 8;
  const allowedTypes = new Map([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"]
  ]);

  function validate(files) {
    if (!files.length || files.length > maxImages) {
      throw new Error(`Choose between 1 and ${maxImages} product photos.`);
    }

    files.forEach((file) => {
      if (!allowedTypes.has(file.type) || file.size > maxFileSize) {
        throw new Error(`${file.name} must be a JPG, PNG, or WebP image no larger than 10 MB.`);
      }
    });
  }

  function safeFileName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "") || "product-image";
  }

  async function remove(client, images) {
    const paths = images.map((image) => image?.path).filter((path) => typeof path === "string" && path);
    if (!paths.length) return;
    const { error } = await client.storage.from(bucketName).remove(paths);
    if (error) throw new Error(`Could not remove uploaded product photos: ${error.message}`);
  }

  async function upload(client, userId, productId, files) {
    const selectedFiles = [...files];
    validate(selectedFiles);
    const uploaded = [];
    try {
      for (let index = 0; index < selectedFiles.length; index++) {
        const file = selectedFiles[index];
        const path = `${userId}/${productId}/${index}-${crypto.randomUUID()}-${safeFileName(file.name)}`;
        const { error } = await client.storage.from(bucketName).upload(path, file, {
          upsert: false,
          contentType: file.type
        });
        if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
        const { data } = client.storage.from(bucketName).getPublicUrl(path);
        uploaded.push({ url: data.publicUrl, path });
      }
      return uploaded;
    } catch (error) {
      try {
        await remove(client, uploaded);
      } catch (cleanupError) {
        throw new Error(`${error.message}. ${cleanupError.message}`);
      }
      throw error;
    }
  }

  window.BELLEZAProductImages = { maxImages, validate, upload, remove };
})();
