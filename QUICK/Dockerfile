############################
### Base MPI CUDA 12.0.1 ###
############################
FROM nvidia/cuda:12.0.1-devel-ubuntu22.04 AS base-mpi-cuda-12.0.1

# Install necessary build dependencies
RUN apt-get update -y \
 && apt-get install -y \
    gfortran \
    cmake \
    g++ \
    openmpi-bin \
    openmpi-common \
    libopenmpi-dev \
    git

# Create directories for source and build
RUN mkdir /src \
 && mkdir /src/build

# Set working directory to source
WORKDIR /src

# Ensure the /src directory is empty before cloning
RUN rm -rf /src/*

# Clone the QUICK repository from GitHub
RUN git clone https://github.com/merzlab/QUICK.git .

# Set working directory to build
WORKDIR /src/build

# Configure the build with CMake
RUN cmake .. -DCOMPILER=GNU -DCMAKE_INSTALL_PREFIX=$(pwd)/../install -DCUDA=TRUE -DMPI=TRUE

# Build and install QUICK
RUN make -j2 install

#############################
## Runtime MPI CUDA 12.0.1 ##
#############################

# Runtime image is smaller than the devel/build image
FROM nvidia/cuda:12.0.1-runtime-ubuntu22.04 AS mpi-cuda-12.0.1

# Install runtime dependencies for OpenMPI
RUN apt-get update -y \
 && apt-get install -y \
    openmpi-bin \
    openmpi-common \
    libopenmpi-dev \
    curl \
    procps

# Copy the compiled QUICK files from the build stage
COPY --from=base-mpi-cuda-12.0.1 /src/install /src/install

# Set working directory to the installed location
WORKDIR /src/install

# Set environment variables manually (as in quick.rc)
ENV QUICK_INSTALL=/src/install
ENV QUICK_BASIS=$QUICK_INSTALL/basis
ENV PATH=$PATH:$QUICK_INSTALL/bin

# Default command to run when starting the container
CMD ["bash"]