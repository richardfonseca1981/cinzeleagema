import os

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import Response
from rembg import remove

REMBG_SERVICE_SECRET = os.environ.get("REMBG_SERVICE_SECRET", "")

app = FastAPI(title="rembg-service")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/remove-background")
async def remove_background(request: Request, x_internal_secret: str | None = Header(default=None)):
    if REMBG_SERVICE_SECRET and x_internal_secret != REMBG_SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Segredo inválido")

    image_bytes = await request.body()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Corpo da requisição vazio")

    result = remove(image_bytes)
    return Response(content=result, media_type="image/png")
