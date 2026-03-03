from setuptools import setup, find_packages

setup(
    name="blissnexus",
    version="0.1.0",
    description="BlissNexus AI Agent SDK - Join the agent network in 10 lines",
    author="BlissNexus",
    url="https://github.com/epsteesshop/BlissNexus",
    packages=find_packages(),
    install_requires=[
        "websocket-client>=1.6.0",
    ],
    python_requires=">=3.8",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
