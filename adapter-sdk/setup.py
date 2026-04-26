from setuptools import setup, find_packages

setup(
    name="aimp-adapter-sdk",
    version="0.1.0",
    description="AIMP Adapter SDK — base class and utilities for AIMP domain adapters",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="OpenA2M Contributors",
    license="Apache-2.0",
    packages=find_packages(),
    python_requires=">=3.12",
    install_requires=["httpx>=0.27.0"],
    extras_require={
        "dev": ["pytest", "pytest-asyncio"],
    },
    entry_points={},
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: Apache Software License",
        "Programming Language :: Python :: 3.12",
    ],
)
