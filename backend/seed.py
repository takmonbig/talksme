"""Reseed the demo dataset: cd /app/backend && python seed.py"""
import asyncio

from lib.seed_data import reset_demo

if __name__ == "__main__":
    asyncio.run(reset_demo())
    print("Demo data seeded.")
