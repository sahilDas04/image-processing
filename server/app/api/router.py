from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.history import router as history_router
from app.api.routes.images import router as images_router
from app.api.routes.upload import router as upload_router


api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(images_router)
api_router.include_router(upload_router)
api_router.include_router(history_router)
