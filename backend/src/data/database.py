from ast import Pass
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from contextlib import contextmanager
from infrastructure.settings import settings
from data.schema import Base
import os
from dotenv import load_dotenv

load_dotenv()

class Database:
  def __init__(self):
    self.engine = create_engine(os.getenv("DATABASE_URL"))
    self.session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

  def init(self):
    Base.metadata.create_all(self.engine)

  def drop(self):
    Base.metadata.drop_all(self.engine)

  @contextmanager
  def get_session(self):
    session = self.session()
    try:
      yield session
    finally:
      session.close()

  def create(self, obj: Base):
    with self.get_session() as session:
      session.add(obj)
      session.commit()

  def get_repo(self, url: str):
    pass

  def get_commit(self, url: str, sha: str):
    pass

  def get_commits(self, url: str):
    pass

  def get_branches(self, url: str):
    pass

  def get_branch(self, url: str, name: str):
    pass

  def parse_sql_branch(self, obj: Base):
    pass

  def parse_sql_commit(self, obj: Base):
    pass

  def parse_sql_repo(self, obj: Base):
    pass

  def parse_sql_file_change(self, obj: Base):
    pass
    