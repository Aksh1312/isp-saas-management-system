using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

namespace NetPulse.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SubscriberController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IMikroTikService _mikroTik;
        private readonly IRadiusService _radius;

        public SubscriberController(AppDbContext context, IMikroTikService mikroTik, IRadiusService radius)
        {
            _context = context;
            _mikroTik = mikroTik;
            _radius = radius;
        }

        [HttpPost("approve/{id}")]
        public async Task<IActionResult> ApproveSubscriber(Guid id)
        {
            var profile = await _context.SubscriberProfiles
                .Include(p => p.User)
                .FirstOrDefaultAsync(p => p.ProfileId == id);

            if (profile == null) return NotFound();

            // 1. Update Status
            profile.Status = "Active";

            // 2. Provision in FreeRADIUS
            await _radius.CreateUserAsync(profile.MikroTikUsername, profile.User.PasswordHash);

            // 3. Provision in MikroTik
            await _mikroTik.CreatePppoeUserAsync(new PppoeUser 
            {
                Name = profile.MikroTikUsername,
                Password = "...",
                Profile = "100M_Plan",
                RemoteAddress = profile.StaticIp
            });

            await _context.SaveChangesAsync();

            return Ok(new { Message = "Subscriber approved and network services provisioned." });
        }
    }

    // --- Services Implementation Examples ---

    public interface IMikroTikService {
        Task CreatePppoeUserAsync(PppoeUser user);
    }

    public class MikroTikService : IMikroTikService {
        public async Task CreatePppoeUserAsync(PppoeUser user) {
            // Implementation using MikroTik API (Port 8728)
            // Example command: /ppp/secret/add name=user1 password=pass profile=100M
        }
    }

    public interface IRadiusService {
        Task CreateUserAsync(string username, string password);
    }

    public class RadiusService : IRadiusService {
        public async Task CreateUserAsync(string username, string password) {
            // Implementation inserting into FreeRADIUS 'radcheck' table
        }
    }
}
