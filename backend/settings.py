from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    DATA_ROOT: str = "./data"

    # CORS：开发阶段允许本地前端
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # 存储后端开关：1=Azure Blob；0=本地文件
    USE_AZURE_BLOB: int = 0
    AZURE_STORAGE_ACCOUNT: str | None = None
    AZURE_STORAGE_CONTAINER: str = "structures"

    # 管理员 token（排行榜等接口需要时）
    ADMIN_TOKEN: str = "change-me"

settings = Settings()
