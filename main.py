import numpy as np
from scipy.integrate import odeint
import matplotlib.pyplot as plt

# Constants (Normalized: G = c = M = 1)
Rs = 2.0  

def geodesic_eq(state, t):
    """ Defines the equations of motion for a photon near a black hole """
    x, y, z, vx, vy, vz = state
    r = np.sqrt(x**2 + y**2 + z**2)
    
    # General Relativity 'acceleration' approximation
    # The force scales with 1/r^4 for light rays in these coordinates
    accel_mag = -1.5 * Rs * (vx**2 + vy**2 + vz**2) / (r**4)
    
    ax = accel_mag * x
    ay = accel_mag * y
    az = accel_mag * z
    return [vx, vy, vz, ax, ay, az]

# --- Setup rays ---
num_rays = 30
t = np.linspace(0, 50, 500)
fig = plt.figure(figsize=(10, 8))
ax = fig.add_subplot(111, projection='3d')

for i in np.linspace(-5, 5, num_rays):
    # Initial position (x, y, z) and velocity (vx, vy, vz)
    # Starting rays from the side to see the bend
    initial_state = [-20, i, 2, 1.0, 0, 0] 
    
    sol = odeint(geodesic_eq, initial_state, t)
    
    # Filter out points that fall into the Event Horizon
    r_dist = np.sqrt(sol[:,0]**2 + sol[:,1]**2 + sol[:,2]**2)
    sol = sol[r_dist > Rs * 0.5] 

    ax.plot(sol[:, 0], sol[:, 1], sol[:, 2], alpha=0.6, color='cyan')

# --- Draw Black Hole ---
u, v = np.mgrid[0:2*np.pi:20j, 0:np.pi:10j]
x_bh = Rs * np.cos(u) * np.sin(v)
y_bh = Rs * np.sin(u) * np.sin(v)
z_bh = Rs * np.cos(v)
ax.plot_surface(x_bh, y_bh, z_bh, color='black')

ax.set_facecolor('black')
plt.axis('off')
plt.show()